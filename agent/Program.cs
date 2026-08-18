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
        var builder = WebApplication.CreateBuilder(args);

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
        var allowedOrigins = (builder.Configuration["AGENT_ALLOWED_ORIGINS"]
                ?? "http://localhost:3000")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        const string corsPolicyName = "_agentAllowedOrigins";
        builder.Services.AddCors(options =>
        {
            options.AddPolicy(corsPolicyName, policy =>
                policy.WithOrigins(allowedOrigins)
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials()
                    .WithExposedHeaders("Access-Control-Allow-Private-Network"));
        });

        var webApp = builder.Build();

        webApp.UseCors(corsPolicyName);

        // Middleware para tratar preflight request de Private Network Access do Chrome
        webApp.Use(async (context, next) =>
        {
            if (context.Request.Method == "OPTIONS" && context.Request.Headers.ContainsKey("Access-Control-Request-Private-Network"))
            {
                context.Response.Headers.Append("Access-Control-Allow-Private-Network", "true");
            }
            await next();
        });

        webApp.MapGet("/v1/status", () => Results.Json(new
        {
            agentVersion = "1.1.0",
            protocolVersion = 1,
            os = "windows",
            providers = new[] { "windows-store" }
        }));

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

    private static bool IsAutoStartEnabled()
    {
        using var key = Registry.CurrentUser.OpenSubKey(AutoStartRegistryKey, writable: false);
        return key?.GetValue(AutoStartValueName) is string existing
            && existing.Equals(GetExecutablePath(), StringComparison.OrdinalIgnoreCase);
    }

    private static void SetAutoStart(bool enabled)
    {
        using var key = Registry.CurrentUser.OpenSubKey(AutoStartRegistryKey, writable: true)
            ?? Registry.CurrentUser.CreateSubKey(AutoStartRegistryKey);
        if (enabled)
        {
            key.SetValue(AutoStartValueName, GetExecutablePath());
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
