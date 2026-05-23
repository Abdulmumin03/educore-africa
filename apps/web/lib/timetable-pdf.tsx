import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer"

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export type TimetablePdfSlot = {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  room: string | null
  subject: { id: string; name: string; code: string }
  teacher: { firstName: string; lastName: string; initials: string }
  class: { id: string; name: string }
  section: { id: string; name: string }
}

export type TimetablePdfInput = {
  schoolName: string
  schoolAddress?: string | null
  schoolLogoUrl?: string | null
  scopeLabel: string // e.g. "JSS 2 · Arm A" or "Mrs Adeyemi"
  academicYearLabel: string | null
  days: number[]
  periods: { startTime: string; endTime: string }[]
  slots: TimetablePdfSlot[]
  generatedAt: Date
}

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 9,
    color: "#0f172a",
    fontFamily: "Helvetica",
  },
  header: {
    borderBottom: "1pt solid #cbd5e1",
    paddingBottom: 8,
    marginBottom: 10,
  },
  schoolName: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0D2B5E",
  },
  meta: {
    fontSize: 8,
    color: "#475569",
    marginTop: 2,
  },
  title: {
    fontSize: 12,
    fontWeight: 700,
    marginTop: 6,
  },
  scope: {
    fontSize: 9,
    color: "#334155",
    marginTop: 1,
  },
  table: {
    flexDirection: "column",
    border: "1pt solid #e2e8f0",
    borderRadius: 4,
  },
  row: {
    flexDirection: "row",
    borderBottom: "1pt solid #e2e8f0",
  },
  rowLast: {
    flexDirection: "row",
  },
  headerCell: {
    backgroundColor: "#f1f5f9",
    padding: 4,
    fontSize: 8,
    fontWeight: 700,
    color: "#475569",
    borderRight: "1pt solid #e2e8f0",
  },
  periodCell: {
    padding: 4,
    fontSize: 8,
    borderRight: "1pt solid #e2e8f0",
    backgroundColor: "#fafafa",
  },
  cell: {
    padding: 4,
    borderRight: "1pt solid #e2e8f0",
  },
  cellLast: {
    padding: 4,
  },
  subject: {
    fontSize: 9,
    fontWeight: 700,
  },
  teacher: {
    fontSize: 8,
    color: "#475569",
    marginTop: 1,
  },
  empty: {
    fontSize: 8,
    color: "#cbd5e1",
  },
  footer: {
    marginTop: 14,
    fontSize: 7,
    color: "#94a3b8",
    textAlign: "right",
  },
})

function TimetableDocument({ data }: { data: TimetablePdfInput }) {
  const colCount = data.days.length + 1
  const colWidth = `${100 / colCount}%`

  const slotByCell = new Map<string, TimetablePdfSlot[]>()
  for (const s of data.slots) {
    const key = `${s.dayOfWeek}-${s.startTime}`
    const list = slotByCell.get(key) ?? []
    list.push(s)
    slotByCell.set(key, list)
  }

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.schoolName}>{data.schoolName}</Text>
          {data.schoolAddress && <Text style={styles.meta}>{data.schoolAddress}</Text>}
          <Text style={styles.title}>Weekly Timetable</Text>
          <Text style={styles.scope}>
            {data.scopeLabel}
            {data.academicYearLabel ? ` · ${data.academicYearLabel}` : ""}
          </Text>
        </View>

        <View style={styles.table}>
          <View style={styles.row}>
            <Text style={{ ...styles.headerCell, width: colWidth }}>Period</Text>
            {data.days.map((d, i) => (
              <Text
                key={d}
                style={{
                  ...styles.headerCell,
                  width: colWidth,
                  borderRight: i === data.days.length - 1 ? "none" : "1pt solid #e2e8f0",
                }}
              >
                {DAY_LABELS[d] ?? `Day ${d}`}
              </Text>
            ))}
          </View>
          {data.periods.map((p, pi) => {
            const isLastRow = pi === data.periods.length - 1
            return (
              <View key={p.startTime} style={isLastRow ? styles.rowLast : styles.row}>
                <View style={{ ...styles.periodCell, width: colWidth }}>
                  <Text>{p.startTime}</Text>
                  <Text style={{ color: "#94a3b8" }}>{p.endTime}</Text>
                </View>
                {data.days.map((d, di) => {
                  const cellSlots = slotByCell.get(`${d}-${p.startTime}`) ?? []
                  const isLastCol = di === data.days.length - 1
                  return (
                    <View
                      key={d}
                      style={{
                        ...styles.cell,
                        width: colWidth,
                        borderRight: isLastCol ? "none" : "1pt solid #e2e8f0",
                      }}
                    >
                      {cellSlots.length === 0 ? (
                        <Text style={styles.empty}>—</Text>
                      ) : (
                        cellSlots.map((s) => (
                          <View key={s.id} style={{ marginBottom: 2 }}>
                            <Text style={styles.subject}>{s.subject.name}</Text>
                            <Text style={styles.teacher}>
                              {s.teacher.initials}
                              {s.room ? ` · ${s.room}` : ""}
                            </Text>
                          </View>
                        ))
                      )}
                    </View>
                  )
                })}
              </View>
            )
          })}
        </View>

        <Text style={styles.footer}>
          Generated {data.generatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC
        </Text>
      </Page>
    </Document>
  )
}

export async function renderTimetablePdf(data: TimetablePdfInput): Promise<Buffer> {
  return await renderToBuffer(<TimetableDocument data={data} />)
}
