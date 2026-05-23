/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer's <Image> is not an HTML img */
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

export type VisitorBadgeData = {
  id: string
  visitorName: string
  visitorPhone: string | null
  purpose: string | null
  host: { name: string; role: string } | null
  photoUrl: string | null
  schoolName: string
  schoolLogoUrl: string | null
  checkedInAt: Date
}

const styles = StyleSheet.create({
  // A6 portrait is roughly badge-size; React-PDF doesn't expose A6 directly so
  // we set a custom 105 × 148 mm page via "width/height" in points.
  page: {
    padding: 18,
    fontSize: 10,
    color: "#0f172a",
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottom: "1pt solid #cbd5e1",
    paddingBottom: 6,
    marginBottom: 8,
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 4,
  },
  schoolName: {
    fontSize: 12,
    fontWeight: 700,
    color: "#0D2B5E",
  },
  visitorBlock: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
  },
  photo: {
    width: 72,
    height: 92,
    borderRadius: 4,
    objectFit: "cover",
    border: "1pt solid #cbd5e1",
  },
  visitorName: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 4,
  },
  label: {
    fontSize: 8,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 10,
    marginBottom: 4,
  },
  qrWrap: {
    alignItems: "center",
    marginTop: 6,
  },
  qr: {
    width: 96,
    height: 96,
  },
  footer: {
    marginTop: 6,
    fontSize: 8,
    color: "#94a3b8",
    textAlign: "center",
  },
  visitorBadge: {
    backgroundColor: "#0D2B5E",
    color: "white",
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 1,
    padding: "2pt 8pt",
    borderRadius: 4,
    alignSelf: "flex-start",
  },
})

function BadgeDocument({
  data,
  qrDataUrl,
}: {
  data: VisitorBadgeData
  qrDataUrl: string
}) {
  return (
    <Document>
      <Page
        size={{ width: 298, height: 419 }} // A6 in points (105 x 148 mm)
        style={styles.page}
      >
        <View style={styles.header}>
          {data.schoolLogoUrl ? (
            <Image src={data.schoolLogoUrl} style={styles.logo} />
          ) : null}
          <Text style={styles.schoolName}>{data.schoolName}</Text>
        </View>

        <Text style={styles.visitorBadge}>Visitor</Text>

        <View style={[styles.visitorBlock, { marginTop: 8 }]}>
          {data.photoUrl ? (
            <Image src={data.photoUrl} style={styles.photo} />
          ) : (
            <View style={[styles.photo, { backgroundColor: "#f1f5f9" }]} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.visitorName}>{data.visitorName}</Text>
            {data.visitorPhone && (
              <>
                <Text style={styles.label}>Phone</Text>
                <Text style={styles.value}>{data.visitorPhone}</Text>
              </>
            )}
            {data.host && (
              <>
                <Text style={styles.label}>Host</Text>
                <Text style={styles.value}>
                  {data.host.name} ({data.host.role.replace(/_/g, " ").toLowerCase()})
                </Text>
              </>
            )}
            {data.purpose && (
              <>
                <Text style={styles.label}>Purpose</Text>
                <Text style={styles.value}>{data.purpose}</Text>
              </>
            )}
            <Text style={styles.label}>Check-in</Text>
            <Text style={styles.value}>
              {data.checkedInAt.toISOString().slice(0, 16).replace("T", " ")}
            </Text>
          </View>
        </View>

        <View style={styles.qrWrap}>
          <Image src={qrDataUrl} style={styles.qr} />
          <Text style={[styles.label, { marginTop: 4 }]}>Scan to check out</Text>
        </View>

        <Text style={styles.footer}>
          Visitor ID {data.id.slice(-8).toUpperCase()} · This badge must be worn at all times.
        </Text>
      </Page>
    </Document>
  )
}

export async function renderVisitorBadgePdf(data: VisitorBadgeData): Promise<Buffer> {
  // Encode the visitor id into the QR. Front desk staff can scan it at exit
  // to surface the row and click "Check out".
  const qrDataUrl = await QRCode.toDataURL(`educore:visitor:${data.id}`, {
    margin: 1,
    width: 256,
  })
  return renderToBuffer(<BadgeDocument data={data} qrDataUrl={qrDataUrl} />)
}
