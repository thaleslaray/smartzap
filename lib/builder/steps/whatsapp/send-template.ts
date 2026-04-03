import "server-only";

import { buildMetaTemplatePayload } from "@/lib/whatsapp/template-payload";
import { withStepLogging, type StepInput } from "../step-handler";
import {
  getCredentials,
  parseJsonArray,
  resolveRecipient,
  sendWhatsAppPayload,
} from "./shared";

type SendTemplateResult =
  | { success: true; data: unknown }
  | { success: false; error: string; details?: unknown };

type TemplateParam = { key?: string; text?: string };
type ButtonParam = { index?: number; params?: Array<{ text?: string }> };

export type SendTemplateInput = StepInput & {
  to?: string;
  toSource?: string;
  templateName?: string;
  language?: string;
  parameterFormat?: string;
  bodyParams?: string;
  headerParams?: string;
  buttonParams?: string;
  triggerData?: Record<string, unknown>;
};

export async function sendTemplateStep(
  input: SendTemplateInput
): Promise<SendTemplateResult> {
  "use step";

  return withStepLogging(input, async () => {
    const credentials = await getCredentials();
    if (!credentials) {
      return { success: false, error: "WhatsApp not configured" };
    }

    const recipient = resolveRecipient(input);
    if (!recipient.ok) {
      return { success: false, error: recipient.error };
    }

    const templateName = String(input.templateName || "").trim();
    if (!templateName) {
      return { success: false, error: "Template name is required" };
    }

    const language = String(input.language || "pt_BR");
    const parameterFormat =
      input.parameterFormat === "named" ? "named" : "positional";

    const bodyParams = parseJsonArray<TemplateParam>(input.bodyParams);
    const headerParams = parseJsonArray<TemplateParam>(input.headerParams);
    const buttonParams = parseJsonArray<ButtonParam>(input.buttonParams);

    const payload = buildMetaTemplatePayload({
      to: recipient.to,
      templateName,
      language,
      parameterFormat,
      values: {
        header: headerParams
          .filter((item) => item?.text)
          .map((item) => ({
            key: item.key || "1",
            text: String(item.text),
          })),
        body: bodyParams
          .filter((item) => item?.text)
          .map((item) => ({
            key: item.key || "1",
            text: String(item.text),
          })),
        buttons: buttonParams
          .filter((item) => typeof item?.index === "number")
          .map((item) => ({
            index: item.index as number,
            params: (item.params || [])
              .filter((p) => p?.text)
              .map((p) => ({
                key: "1",
                text: String(p.text),
              })),
          })),
      },
    });

    const result = await sendWhatsAppPayload(credentials, payload);
    if (!result.ok) {
      return { success: false, error: result.error, details: result.data };
    }

    return { success: true, data: result.data };
  });
}
sendTemplateStep.maxRetries = 0;

export const _integrationType = "whatsapp";
