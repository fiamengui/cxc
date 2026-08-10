import { describe, expect, it } from "vitest";
import {
  goalTone,
  greeting,
  percentageChange,
  progressWidth,
} from "./management";

describe("indicadores de gestão", () => {
  it("calcula comparação com período anterior em pontos-base", () => {
    expect(percentageChange(12_000, 10_000)).toBe(2_000);
    expect(percentageChange(8_000, 10_000)).toBe(-2_000);
    expect(percentageChange(0, 0)).toBe(0);
    expect(percentageChange(100, 0)).toBeNull();
  });

  it("limita a largura visual sem esconder progresso acima da meta", () => {
    expect(progressWidth(-100)).toBe(0);
    expect(progressWidth(8_750)).toBe(87.5);
    expect(progressWidth(13_000)).toBe(100);
    expect(progressWidth(null)).toBe(0);
  });

  it("trata despesa como limite e não como objetivo de crescimento", () => {
    expect(goalTone(5_000, true)).toBe("good");
    expect(goalTone(8_500, true)).toBe("warning");
    expect(goalTone(10_001, true)).toBe("critical");
    expect(goalTone(10_000, false)).toBe("good");
  });

  it("produz saudação adequada ao horário local", () => {
    expect(greeting(8)).toBe("Bom dia");
    expect(greeting(15)).toBe("Boa tarde");
    expect(greeting(21)).toBe("Boa noite");
  });
});
