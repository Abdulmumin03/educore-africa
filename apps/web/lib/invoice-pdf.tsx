import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer"
import QRCode from "qrcode"

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: "#0f172a", fontFamily: "Helvetica" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1pt solid #cbd5e1",
    paddingBottom: 10,
    marginBottom: 12,
  },
  schoolBlock: { flex: 1 },
  schoolName: { fontSize: 16, fontWeight: 700, color: "#0D2B5E" },
  schoolMeta: { fontSize: 8.5, color: "#475569" },
  invoiceLabel: {
    fontSize: 14,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 2,
    color: "#0D2B5E",
  },
  invoiceNo: { fontSize: 11, marginTop: 2, color: "#475569" },
  twoCol: { flexDirection: "row", gap: 16, marginBottom: 12 },
  col: { flex: 1 },
  sectionLabel: { fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: 3 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
  rowLabel: { color: "#475569" },
  rowValue: { fontWeight: 700 },
  table: {
    marginTop: 4,
    borderTop: "0.5pt solid #94a3b8",
    borderBottom: "0.5pt solid #94a3b8",
  },
  trHead: {
    flexDirection: "row",
    paddingVertical: 4,
    backgroundColor: "#f1f5f9",
    borderBottom: "0.5pt solid #94a3b8",
    fontWeight: 700,
  },
  tr: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.25pt solid #e2e8f0" },
  c_no: { width: 24, paddingLeft: 4 },
  c_name: { flex: 2.5, paddingLeft: 4 },
  c_cat: { flex: 1, fontSize: 9, color: "#475569" },
  c_amt: { flex: 1, textAlign: "right", paddingRight: 4 },
  totals: { marginTop: 14, flexDirection: "row", justifyContent: "flex-end" },
  totalsBox: { width: 220 },
  totalLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalLabel: { color: "#475569" },
  totalValue: { fontWeight: 700 },
  amountDueLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    marginTop: 4,
    borderTop: "1pt solid #0f172a",
    fontSize: 13,
    fontWeight: 700,
  },
  payCard: {
    marginTop: 16,
    flexDirection: "row",
    gap: 12,
    padding: 10,
    border: "0.5pt solid #cbd5e1",
    borderRadius: 4,
  },
  qrBlock: { width: 120, alignItems: "center" },
  qrCaption: { marginTop: 4, fontSize: 8, color: "#475569", textAlign: "center" },
  bankBlock: { flex: 1 },
  history: { marginTop: 14 },
  hRow: {
    flexDirection: "row",
    paddingVertical: 2,
    borderBottom: "0.25pt solid #e2e8f0",
    fontSize: 9,
  },
  hDate: { flex: 1.2 },
  hRef: { flex: 2, color: "#475569" },
  hChannel: { flex: 1, textAlign: "center", color: "#475569" },
  hAmt: { flex: 1, textAlign: "right", fontWeight: 700 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 32,
    right: 32,
    paddingTop: 6,
    borderTop: "0.5pt solid #cbd5e1",
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#94a3b8",
  },
})

export type InvoicePdfInput = {
  school: {
    name: string
    address?: string | null
    phone?: string | null
    email?: string | null
    logoUrl?: string | null
    motto?: string | null
    bank?: { name: string; accountNumber: string; accountName: string } | null
  }
  student: {
    name: string
    admissionNumber: string
    className: string | null
    sectionName: string | null
  }
  term: { type: string; sessionName: string }
  invoice: {
    no: string
    items: { name: string; category: string; amount: number; isMandatory: boolean }[]
    subtotal: number
    discountAmount: number
    discountReason: string | null
    amountDue: number
    amountPaid: number
    balance: number
    dueDate: string
    status: string
  }
  payments: {
    reference: string
    paidAt: string
    channel: string
    amount: number
  }[]
  payUrl: string | null // URL parents can open to pay online
}

function dateOnly(iso: string) {
  return new Date(iso).toISOString().slice(0, 10)
}

function money(n: number) {
  return `NGN ${n.toLocaleString()}`
}

export function InvoiceDocument({ data, qrDataUrl }: { data: InvoicePdfInput; qrDataUrl: string | null }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.schoolBlock}>
            <Text style={styles.schoolName}>{data.school.name}</Text>
            {data.school.motto && (
              <Text style={[styles.schoolMeta, { fontStyle: "italic" }]}>{data.school.motto}</Text>
            )}
            <Text style={styles.schoolMeta}>
              {[data.school.address, data.school.phone, data.school.email].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <View>
            <Text style={[styles.invoiceLabel, { textAlign: "right" }]}>Invoice</Text>
            <Text style={[styles.invoiceNo, { textAlign: "right" }]}>{data.invoice.no}</Text>
            <Text style={[styles.schoolMeta, { textAlign: "right", marginTop: 6 }]}>
              Issued {dateOnly(new Date().toISOString())}
            </Text>
            <Text style={[styles.schoolMeta, { textAlign: "right" }]}>
              Due {dateOnly(data.invoice.dueDate)}
            </Text>
          </View>
        </View>

        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>Billed to</Text>
            <Text style={{ fontWeight: 700, fontSize: 11 }}>{data.student.name}</Text>
            <Text style={styles.schoolMeta}>Admission no.: {data.student.admissionNumber}</Text>
            {data.student.className && (
              <Text style={styles.schoolMeta}>
                {data.student.className}
                {data.student.sectionName ? ` · Arm ${data.student.sectionName}` : ""}
              </Text>
            )}
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>Term</Text>
            <Text style={{ fontWeight: 700, fontSize: 11 }}>
              {data.term.sessionName} · {data.term.type[0] + data.term.type.slice(1).toLowerCase()} term
            </Text>
            <Text style={styles.schoolMeta}>Status: {data.invoice.status}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Fee breakdown</Text>
        <View style={styles.table}>
          <View style={styles.trHead}>
            <Text style={styles.c_no}>#</Text>
            <Text style={styles.c_name}>Item</Text>
            <Text style={styles.c_cat}>Category</Text>
            <Text style={styles.c_amt}>Amount</Text>
          </View>
          {data.invoice.items.length === 0 ? (
            <View style={styles.tr}>
              <Text style={[styles.c_name, { color: "#94a3b8" }]}>No items.</Text>
            </View>
          ) : (
            data.invoice.items.map((it, i) => (
              <View key={i} style={styles.tr}>
                <Text style={styles.c_no}>{i + 1}</Text>
                <Text style={styles.c_name}>
                  {it.name}
                  {!it.isMandatory ? " (optional)" : ""}
                </Text>
                <Text style={styles.c_cat}>{it.category}</Text>
                <Text style={styles.c_amt}>{money(it.amount)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalsBox}>
            <View style={styles.totalLine}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{money(data.invoice.subtotal)}</Text>
            </View>
            {data.invoice.discountAmount > 0 && (
              <View style={styles.totalLine}>
                <Text style={styles.totalLabel}>
                  Discount{data.invoice.discountReason ? ` (${data.invoice.discountReason})` : ""}
                </Text>
                <Text style={styles.totalValue}>−{money(data.invoice.discountAmount)}</Text>
              </View>
            )}
            <View style={styles.totalLine}>
              <Text style={styles.totalLabel}>Paid so far</Text>
              <Text style={styles.totalValue}>{money(data.invoice.amountPaid)}</Text>
            </View>
            <View style={styles.amountDueLine}>
              <Text>Balance due</Text>
              <Text>{money(data.invoice.balance)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.payCard}>
          <View style={styles.qrBlock}>
            {qrDataUrl ? (
              // @react-pdf/renderer's Image, not the DOM's — it renders into a
              // PDF and takes no alt prop. jsx-a11y matches on the name alone.
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={qrDataUrl} style={{ width: 100, height: 100 }} />
            ) : (
              <View style={{ width: 100, height: 100, backgroundColor: "#f1f5f9" }} />
            )}
            <Text style={styles.qrCaption}>Scan to pay online</Text>
          </View>
          <View style={styles.bankBlock}>
            <Text style={styles.sectionLabel}>Pay by bank transfer</Text>
            {data.school.bank ? (
              <>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Bank</Text>
                  <Text style={styles.rowValue}>{data.school.bank.name}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Account no.</Text>
                  <Text style={styles.rowValue}>{data.school.bank.accountNumber}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Account name</Text>
                  <Text style={styles.rowValue}>{data.school.bank.accountName}</Text>
                </View>
                <Text style={[styles.schoolMeta, { marginTop: 4 }]}>
                  Use invoice number <Text style={styles.rowValue}>{data.invoice.no}</Text> as reference.
                </Text>
              </>
            ) : (
              <Text style={styles.schoolMeta}>Bank details not configured. Use the QR or contact the bursar.</Text>
            )}
          </View>
        </View>

        {data.payments.length > 0 && (
          <View style={styles.history}>
            <Text style={styles.sectionLabel}>Payment history</Text>
            {data.payments.map((p, i) => (
              <View key={i} style={styles.hRow}>
                <Text style={styles.hDate}>{dateOnly(p.paidAt)}</Text>
                <Text style={styles.hRef}>{p.reference}</Text>
                <Text style={styles.hChannel}>{p.channel.replace("_", " ")}</Text>
                <Text style={styles.hAmt}>{money(p.amount)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>{data.school.name} · {data.school.phone ?? ""}</Text>
          <Text>Generated by EduCore Africa</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function renderInvoicePdf(data: InvoicePdfInput): Promise<Buffer> {
  const qrDataUrl = data.payUrl
    ? await QRCode.toDataURL(data.payUrl, { width: 240, margin: 1 }).catch(() => null)
    : null
  return await renderToBuffer(<InvoiceDocument data={data} qrDataUrl={qrDataUrl} />)
}
