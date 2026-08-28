import { MERGE_TAGS, listTemplates } from "@/lib/templates"
import { TemplateEditor, type TemplateRow } from "../template-editor"

export async function EmailTab() {
  const templates = (await listTemplates("EMAIL")) as unknown as TemplateRow[]
  return <TemplateEditor kind="EMAIL" templates={templates} mergeTags={[...MERGE_TAGS]} />
}
