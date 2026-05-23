export const runtime = "nodejs"
export const dynamic = "force-static"

const CSV = [
  "email,firstName,lastName,role,phone",
  "teacher1@example.com,Ada,Okeke,TEACHER,+2348000000001",
  "bursar1@example.com,Tunde,Bello,BURSAR,+2348000000002",
  "parent1@example.com,Ngozi,Adeyemi,PARENT,+2348000000003",
].join("\n")

export async function GET() {
  return new Response(CSV, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="users-template.csv"',
    },
  })
}
