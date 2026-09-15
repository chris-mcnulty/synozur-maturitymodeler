import { beforeEach, describe, expect, it, vi } from "vitest";

const { call, get } = vi.hoisted(() => ({ call: vi.fn(), get: vi.fn() }));
vi.mock("../ai-providers/registry", () => ({
  providerRegistry: { get },
}));

import { translateModelContentWithFoundry } from "../model-translation-service";

const source = {
  name: "Personal AI Skills",
  description: "Short survey",
  dimensions: [{ key: "start", label: "Getting started", description: null }],
  questions: [{ order: 1, text: "Question", answers: [{ order: 1, text: "Answer" }] }],
};

describe("Foundry learner translation", () => {
  beforeEach(() => {
    call.mockReset();
    get.mockReset();
  });

  it("uses only the azure-foundry provider and parses its JSON response", async () => {
    get.mockReturnValue({ isAvailable: () => true, call });
    call.mockResolvedValue(JSON.stringify({
      ...source,
      name: "Compétences personnelles en IA",
      description: "Sondage court",
      dimensions: [{ ...source.dimensions[0], label: "Premiers pas" }],
      questions: [{ ...source.questions[0], text: "Question française", answers: [{ order: 1, text: "Réponse" }] }],
    }));

    const translated = await translateModelContentWithFoundry(source, "fr");

    expect(get).toHaveBeenCalledWith("azure-foundry");
    expect(call).toHaveBeenCalledOnce();
    expect(translated.name).toBe("Compétences personnelles en IA");
  });

  it("returns an explicit unavailable error instead of using another provider", async () => {
    get.mockReturnValue(undefined);
    await expect(translateModelContentWithFoundry(source, "fr"))
      .rejects.toMatchObject({ statusCode: 503 });
    expect(call).not.toHaveBeenCalled();
  });
});