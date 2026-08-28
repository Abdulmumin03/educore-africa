import { MERGE_TAGS, listTemplates } from "@/lib/templates"
import { TemplateEditor, type TemplateRow } from "../template-editor"

export async function SmsTab() {
  const templates = (await listTemplates("SMS")) as unknown as TemplateRow[]
  return <TemplateEditor kind="SMS" templates={templates} mergeTags={[...MERGE_TAGS]} />
}
