export const runtime = "nodejs"
export const dynamic = "force-static"

const CSV = [
  "title,author,isbn,category,publisher,year,description,totalCopies",
  '"Things Fall Apart","Chinua Achebe","9780435905255","Fiction","Heinemann",1958,"Classic Nigerian novel",3',
  '"New General Mathematics SS1","M F Macrae","9780582551534","Textbook","Pearson",2018,"Standard SS1 maths textbook",10',
].join("\n")

export async function GET() {
  return new Response(CSV, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="books-template.csv"',
    },
  })
}
