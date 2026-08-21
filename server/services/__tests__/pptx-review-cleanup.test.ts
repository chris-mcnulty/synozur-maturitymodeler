import { describe, expect, it, vi } from "vitest";
import { storeReviewPreviewImages } from "../pptx-import";
import { partitionPptxReviewAssets } from "../pptx-review-session-service";
import { isPptxReviewPreviewPath } from "../pptx-review-paths";

describe("PowerPoint review preview cleanup", () => {
  it("removes only previews that are neither retained nor attached to a course", () => {
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const first = `/objects/slides/preview/${sessionId}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`;
    const second = `/objects/slides/preview/${sessionId}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png`;
    const third = `/objects/slides/preview/${sessionId}/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png`;

    expect(partitionPptxReviewAssets({
      previewPaths: [first, second, third, third],
      retainedPaths: [first],
      courseReferencedPaths: [second],
    })).toEqual({
      retainedPaths: [first, second],
      deletablePaths: [third],
    });
  });

  it("cleans up previews uploaded before a later upload fails", async () => {
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const first = `/objects/slides/preview/${sessionId}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`;
    const storeObjectBytes = vi.fn()
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error("storage unavailable"));
    const deleteObjectByPath = vi.fn().mockResolvedValue(true);

    await expect(storeReviewPreviewImages({
      images: [Buffer.from("first"), Buffer.from("second")],
      ownerUserId: "user-1",
      reviewSessionId: sessionId,
      storage: { storeObjectBytes, deleteObjectByPath },
    })).rejects.toThrow("storage unavailable");

    expect(deleteObjectByPath).toHaveBeenCalledOnce();
    expect(deleteObjectByPath).toHaveBeenCalledWith(first);
    expect(storeObjectBytes).toHaveBeenCalledWith(expect.objectContaining({
      entityId: expect.stringMatching(new RegExp(`^slides/preview/${sessionId}/.+\\.png$`)),
    }));
  });

  it("distinguishes new session previews from historical committed previews", () => {
    const sessionPreview = "/objects/slides/preview/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";
    const historicalPreview = "/objects/slides/preview/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";

    expect(isPptxReviewPreviewPath(sessionPreview)).toBe(true);
    expect(isPptxReviewPreviewPath(historicalPreview)).toBe(false);
  });
});