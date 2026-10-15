using System.Collections.Concurrent;
using System.Text.Json;
using Agent.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Win32;

namespace Agent;

internal static class Program
{
    private const int Port = 52310;
    private const string AutoStartRegistryKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string AutoStartValueName = "AssinaturaDigitalAgent";
    private const string AllowedOriginsKey = "AGENT_ALLOWED_ORIGINS";

    // Origens liberadas no CORS — lidas do appsettings.json na partida e
    // alteráveis em runtime pelo menu da bandeja ("Liberar site bloqueado"),
    // por isso compartilhadas entre o middleware e a UI.
    private static readonly ConcurrentDictionary<string, byte> AllowedOrigins = new(StringComparer.OrdinalIgnoreCase);

    // Origens que bateram no agente e foram recusadas — aparecem no menu da
    // bandeja pra quem está na frente da máquina liberar com um clique, sem
    // precisar editar o appsettings.json à mão.
    private static readonly ConcurrentDictionary<string, DateTime> RejectedOrigins = new(StringComparer.OrdinalIgnoreCase);

    private static string SettingsPath => Path.Combine(AppContext.BaseDirectory, "appsettings.json");

    [STAThread]
    private static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        var app = BuildWebApplication(args);

        // StartAsync (não RunAsync) pra observar AGORA se o bind da porta
        // falhar — com RunAsync "fire-and-forget", uma segunda instância do
        // Agent.exe já aberta faz a porta falhar silenciosamente e o ícone
        // da bandeja fica "zumbi": aparece, mas não responde nada, sem
        // nenhum aviso em lugar nenhum.
        try
        {
            app.StartAsync().GetAwaiter().GetResult();
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Não foi possível iniciar o agente na porta {Port}.\n\n" +
                "Provavelmente já existe outra instância do Agent.exe rodando — feche todas pelo Gerenciador de Tarefas (aba Detalhes) e abra de novo.\n\n" +
                $"Detalhe técnico: {ex.Message}",
                "Agente de Assinatura Digital — erro ao iniciar",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return;
        }

        using var trayIcon = CreateTrayIcon();
        Application.Run();

        app.StopAsync().GetAwaiter().GetResult();
    }

    private static WebApplication BuildWebApplication(string[] args)
    {
        // ContentRootPath explícito na pasta do Agent.exe: o padrão do
        // WebApplication é a pasta ATUAL do processo (só C:\Windows\System32
        // tem tratamento especial do .NET). Aberto de qualquer outra pasta
        // (linha de comando, outro atalho, outro launcher), o appsettings.json
        // não era encontrado, só localhost:3000 ficava liberado e o site de
        // produção via o agente como "não está rodando".
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = args,
            ContentRootPath = AppContext.BaseDirectory,
        });

        // Escuta só no loopback — nunca exposto pra fora da máquina.
        builder.WebHost.ConfigureKestrel(serverOptions => serverOptions.ListenLocalhost(Port));

        builder.Services.AddSingleton<ICertificateProvider, WindowsStoreProvider>();

        // Origens permitidas via appsettings.json (chave "AGENT_ALLOWED_ORIGINS",
        // separadas por vírgula) OU variável de ambiente de mesmo nome — o
        // builder.Configuration já lê os dois automaticamente. Antes ficava
        // hardcoded no código (com um domínio de produção placeholder),
        // exigindo recompilar o agente pra cada domínio novo. O instalador
        // (installer/install.ps1) escreve o appsettings.json com o domínio
        // real na hora de instalar em cada máquina.
        foreach (var configured in (builder.Configuration[AllowedOriginsKey] ?? "http://localhost:3000")
                     .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            AllowedOrigins.TryAdd(configured.TrimEnd('/'), 0);
        }

        var webApp = builder.Build();

        // CORS + Private Network Access tratados aqui, à mão, em vez de
        // AddCors/UseCors — o middleware embutido do ASP.NET Core não
        // conhece "Access-Control-Request-Private-Network" (não é do
        // protocolo CORS clássico, é uma extensão do Chrome) e, pior,
        // responde e encerra o pipeline sozinho pra qualquer preflight
        // OPTIONS que bata na política, então nenhum middleware registrado
        // depois dele (nem antes, dependendo da ordem) tem garantia de opinar
        // na resposta final. Fazendo tudo numa única função, sem depender de
        // onde o pipeline embutido decide parar, elimina essa incerteza.
        // Sem o header "Access-Control-Allow-Private-Network: true" no
        // preflight, o Chrome bloqueia QUALQUER chamada da página
        // (https://...) pro agente (http://127.0.0.1) com "Permission was
        // denied for this request to access the loopback address space" —
        // mesmo com o agente instalado e rodando certinho.
        webApp.Use(async (context, next) =>
        {
            var origin = context.Request.Headers.Origin.ToString();
            var originAllowed = !string.IsNullOrEmpty(origin) && AllowedOrigins.ContainsKey(origin);

            // /v1/status é legível por qualquer origem (só expõe versão e se a
            // origem que perguntou está liberada) — é o que deixa o site
            // diferenciar "agente desligado" de "agente rodando mas recusando
            // este site", que pro navegador são o mesmo erro de rede genérico.
            var isStatus = context.Request.Path.Equals("/v1/status", StringComparison.OrdinalIgnoreCase);
            var statusReadable = isStatus && !string.IsNullOrEmpty(origin);

            if (!string.IsNullOrEmpty(origin) && !originAllowed && IsWebOrigin(origin))
            {
                RejectedOrigins[origin] = DateTime.Now;
            }

            if (originAllowed)
            {
                context.Response.Headers.Append("Access-Control-Allow-Origin", origin);
                context.Response.Headers.Append("Vary", "Origin");
                context.Response.Headers.Append("Access-Control-Allow-Credentials", "true");
            }
            else if (statusReadable)
            {
                context.Response.Headers.Append("Access-Control-Allow-Origin", origin);
                context.Response.Headers.Append("Vary", "Origin");
            }

            if (context.Request.Method == "OPTIONS")
            {
                if (originAllowed || statusReadable)
                {
                    var requestedHeaders = context.Request.Headers["Access-Control-Request-Headers"].ToString();
                    context.Response.Headers.Append("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                    context.Response.Headers.Append(
                        "Access-Control-Allow-Headers",
                        string.IsNullOrEmpty(requestedHeaders) ? "Content-Type" : requestedHeaders);
                    if (context.Request.Headers.ContainsKey("Access-Control-Request-Private-Network"))
                    {
                        context.Response.Headers.Append("Access-Control-Allow-Private-Network", "true");
                    }
                }
                // Preflight sempre termina aqui, sem chamar "next" — nunca deve
                // cair numa rota de verdade, e responder 204 é o esperado tanto
                // pra origem permitida quanto pra qualquer outra (só sem os
                // headers de CORS, o que já barra a leitura da resposta).
                context.Response.StatusCode = StatusCodes.Status204NoContent;
                return;
            }

            await next();
        });

        webApp.MapGet("/v1/status", (HttpContext context) =>
        {
            var origin = context.Request.Headers.Origin.ToString();
            return Results.Json(new
            {
                agentVersion = "1.2.0",
                protocolVersion = 1,
                os = "windows",
                providers = new[] { "windows-store" },
                // null quando chamado sem Origin (ex.: aberto direto numa aba).
                originAllowed = string.IsNullOrEmpty(origin) ? (bool?)null : AllowedOrigins.ContainsKey(origin),
            });
        });

        webApp.MapGet("/v1/certificates", (ICertificateProvider provider) =>
        {
            try
            {
                return Results.Json(provider.GetCertificates());
            }
            catch (Exception ex)
            {
                return Results.Problem(detail: ex.Message, statusCode: 500);
            }
        });

        webApp.MapPost("/v1/sign", (SignRequest req, ICertificateProvider provider) =>
        {
            try
            {
                var sigBase64 = provider.SignHash(req.thumbprint, req.hashBase64, req.hashAlgorithm, req.signaturePadding);
                return Results.Json(new
                {
                    signatureBase64 = sigBase64,
                    signedAt = DateTime.UtcNow.ToString("O")
                });
            }
            catch (Exception ex)
            {
                return Results.Problem(detail: ex.Message, statusCode: 500);
            }
        });

        return webApp;
    }

    private static NotifyIcon CreateTrayIcon()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add(new ToolStripMenuItem($"Rodando em localhost:{Port}") { Enabled = false });
        menu.Items.Add(new ToolStripSeparator());

        // Reconstruídos a cada abertura do menu — refletem as origens
        // liberadas/recusadas no momento, não as da hora em que o ícone subiu.
        var allowedItem = new ToolStripMenuItem("Sites liberados");
        var rejectedItem = new ToolStripMenuItem("Liberar site bloqueado");
        menu.Items.Add(allowedItem);
        menu.Items.Add(rejectedItem);
        menu.Opening += (_, _) => RefreshOriginMenus(allowedItem, rejectedItem);
        RefreshOriginMenus(allowedItem, rejectedItem);

        var openFolderItem = new ToolStripMenuItem("Abrir pasta do agente");
        openFolderItem.Click += (_, _) => OpenAgentFolder();
        menu.Items.Add(openFolderItem);
        menu.Items.Add(new ToolStripSeparator());

        var autoStartItem = new ToolStripMenuItem("Iniciar com o Windows")
        {
            CheckOnClick = true,
            Checked = IsAutoStartEnabled(),
        };
        autoStartItem.Click += (_, _) => SetAutoStart(autoStartItem.Checked);
        menu.Items.Add(autoStartItem);

        menu.Items.Add(new ToolStripSeparator());
        var exitItem = new ToolStripMenuItem("Sair");
        exitItem.Click += (_, _) => Application.Exit();
        menu.Items.Add(exitItem);

        return new NotifyIcon
        {
            Icon = LoadTrayIcon(),
            Text = "Agente de Assinatura Digital",
            Visible = true,
            ContextMenuStrip = menu,
        };
    }

    // O ícone do executável (ApplicationIcon em Agent.csproj, agent.ico) já
    // vem embutido no .exe — reaproveita ele pro ícone da bandeja também, em
    // vez de duplicar o arquivo como recurso separado. Cai pro ícone padrão
    // do Windows só se a extração falhar por algum motivo.
    private static Icon LoadTrayIcon()
    {
        try
        {
            return Icon.ExtractAssociatedIcon(GetExecutablePath()) ?? SystemIcons.Shield;
        }
        catch
        {
            return SystemIcons.Shield;
        }
    }

    private static void RefreshOriginMenus(ToolStripMenuItem allowedItem, ToolStripMenuItem rejectedItem)
    {
        allowedItem.DropDownItems.Clear();
        foreach (var origin in AllowedOrigins.Keys.OrderBy(o => o))
        {
            allowedItem.DropDownItems.Add(new ToolStripMenuItem(origin) { Enabled = false });
        }
        allowedItem.DropDownItems.Add(new ToolStripSeparator());
        allowedItem.DropDownItems.Add(new ToolStripMenuItem($"Configuração: {SettingsPath}") { Enabled = false });

        rejectedItem.DropDownItems.Clear();
        var pending = RejectedOrigins
            .Where(kv => !AllowedOrigins.ContainsKey(kv.Key))
            .OrderByDescending(kv => kv.Value)
            .Take(10)
            .ToList();
        rejectedItem.Enabled = pending.Count > 0;
        rejectedItem.Text = pending.Count > 0
            ? $"Liberar site bloqueado ({pending.Count})"
            : "Liberar site bloqueado (nenhum)";
        foreach (var (origin, lastSeen) in pending)
        {
            var item = new ToolStripMenuItem($"{origin}  (tentou às {lastSeen:HH:mm})");
            item.Click += (_, _) => ConfirmAndAllowOrigin(origin);
            rejectedItem.DropDownItems.Add(item);
        }
    }

    private static void ConfirmAndAllowOrigin(string origin)
    {
        var answer = MessageBox.Show(
            $"Liberar o site abaixo para usar os certificados digitais desta máquina?\n\n{origin}\n\n" +
            "Só confirme se este for o endereço do sistema da clínica.",
            "Agente de Assinatura Digital",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question,
            MessageBoxDefaultButton.Button2);
        if (answer != DialogResult.Yes) return;

        AllowedOrigins.TryAdd(origin, 0);
        RejectedOrigins.TryRemove(origin, out _);
        try
        {
            SaveAllowedOrigins();
            MessageBox.Show(
                $"Site liberado: {origin}\n\nVolte ao navegador e clique em \"Testar novamente\".",
                "Agente de Assinatura Digital",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"O site foi liberado até o agente ser fechado, mas não deu pra salvar em {SettingsPath}.\n\nDetalhe técnico: {ex.Message}",
                "Agente de Assinatura Digital",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }

    // Reescreve o appsettings.json preservando as outras chaves que existirem.
    private static void SaveAllowedOrigins()
    {
        var settings = new Dictionary<string, object?>();
        if (File.Exists(SettingsPath))
        {
            var existing = JsonSerializer.Deserialize<Dictionary<string, object?>>(File.ReadAllText(SettingsPath));
            if (existing != null) settings = existing;
        }
        settings[AllowedOriginsKey] = string.Join(",", AllowedOrigins.Keys.OrderBy(o => o));
        File.WriteAllText(SettingsPath, JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true }));
    }

    // Só origens http(s) "limpas" entram na lista de recusadas — evita poluir
    // o menu com "null" (file://, sandbox) ou lixo mandado no header.
    private static bool IsWebOrigin(string origin) =>
        Uri.TryCreate(origin, UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp)
        && uri.GetLeftPart(UriPartial.Authority).Equals(origin, StringComparison.OrdinalIgnoreCase);

    private static void OpenAgentFolder()
    {
        try
        {
            System.Diagnostics.Process.Start("explorer.exe", $"\"{AppContext.BaseDirectory}\"");
        }
        catch
        {
            // Sem explorer disponível não há o que fazer — ignora.
        }
    }

    private static bool IsAutoStartEnabled()
    {
        using var key = Registry.CurrentUser.OpenSubKey(AutoStartRegistryKey, writable: false);
        // O instalador grava o caminho entre aspas e o menu daqui gravava sem —
        // compara ignorando as aspas pros dois casos marcarem o checkbox.
        return key?.GetValue(AutoStartValueName) is string existing
            && existing.Trim('"').Equals(GetExecutablePath(), StringComparison.OrdinalIgnoreCase);
    }

    private static void SetAutoStart(bool enabled)
    {
        using var key = Registry.CurrentUser.OpenSubKey(AutoStartRegistryKey, writable: true)
            ?? Registry.CurrentUser.CreateSubKey(AutoStartRegistryKey);
        if (enabled)
        {
            key.SetValue(AutoStartValueName, $"\"{GetExecutablePath()}\"");
        }
        else
        {
            key.DeleteValue(AutoStartValueName, throwOnMissingValue: false);
        }
    }

    private static string GetExecutablePath() => Environment.ProcessPath ?? Application.ExecutablePath;
}

public class SignRequest
{
    public string thumbprint { get; set; } = string.Empty;
    public string hashBase64 { get; set; } = string.Empty;
    public string hashAlgorithm { get; set; } = "SHA256";
    public string signaturePadding { get; set; } = "PKCS1";
    public string requestId { get; set; } = string.Empty;
}
