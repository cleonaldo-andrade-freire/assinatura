import { describe, expect, it } from "vitest";
import { formatLocationAddress, locationMapsUrl, locationMessageBlock } from "./locations";
import type { ClinicLocation } from "./database.types";

const base: ClinicLocation = {
  id: "1",
  clinic_id: "c",
  name: "Consultório Centro",
  cep: "49010000",
  street: "Rua Itabaiana",
  number: "123",
  complement: "Sala 4",
  neighborhood: "Centro",
  city: "Aracaju",
  state: "se",
  maps_url: null,
  is_default: true,
  active: true,
  created_at: "",
  updated_at: "",
};

describe("formatLocationAddress", () => {
  it("monta rua, número, complemento, bairro e cidade/UF", () => {
    expect(formatLocationAddress(base)).toBe("Rua Itabaiana, 123, Sala 4 — Centro, Aracaju/SE");
  });

  it("campos opcionais vazios não deixam vírgula sobrando", () => {
    expect(formatLocationAddress({ ...base, number: null, complement: "  ", neighborhood: null })).toBe(
      "Rua Itabaiana — Aracaju/SE"
    );
  });
});

describe("locationMapsUrl", () => {
  it("usa o link colado pela clínica quando existe", () => {
    expect(locationMapsUrl({ ...base, maps_url: " https://maps.app.goo.gl/abc " })).toBe("https://maps.app.goo.gl/abc");
  });

  it("sem link, gera a busca do Google Maps com o endereço + CEP codificados", () => {
    const url = locationMapsUrl(base);
    expect(url.startsWith("https://www.google.com/maps/search/?api=1&query=")).toBe(true);
    expect(decodeURIComponent(url.split("query=")[1])).toBe("Rua Itabaiana, 123, Sala 4 — Centro, Aracaju/SE, 49010000");
  });
});

describe("locationMessageBlock", () => {
  it("traz nome, endereço e link em linhas separadas", () => {
    const block = locationMessageBlock(base).split("\n");
    expect(block[0]).toBe("📍 *Consultório Centro*");
    expect(block[1]).toBe("Rua Itabaiana, 123, Sala 4 — Centro, Aracaju/SE");
    expect(block[2].startsWith("Como chegar: https://www.google.com/maps/")).toBe(true);
  });
});
