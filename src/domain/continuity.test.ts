import { describe, expect, it } from "vitest";
import { backupPasswordError, continuityHealth, updateLicenseMessage } from "./continuity";

describe("continuidade", () => {
  it("valida senha sem persistir regras somente na interface", () => {
    expect(backupPasswordError("curta")).toContain("8 caracteres");
    expect(backupPasswordError("senha-segura")).toBeNull();
  });
  it("combina integridade e vínculos para o estado do banco", () => {
    expect(continuityHealth("ok", 0)).toBe("HEALTHY");
    expect(continuityHealth("ok", 1)).toBe("ATTENTION");
  });
  it("explica compatibilidade comercial da atualização", () => {
    expect(updateLicenseMessage(false, true)).toContain("incluída");
    expect(updateLicenseMessage(true, false)).toContain("não autoriza");
  });
});
