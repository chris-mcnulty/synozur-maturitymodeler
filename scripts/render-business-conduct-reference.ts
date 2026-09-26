import { renderQuickReference } from "../courseware/annual-training/business-conduct/graphics";
import { closeRenderer } from "../courseware/annual-training/shared/render";

try {
  await renderQuickReference();
  console.log("Updated business-conduct decision reference PDF.");
} finally {
  await closeRenderer();
}