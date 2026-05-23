export type StaffDTO = {
  id: string
  staffNumber: string
  staffType: "TEACHING" | "NON_TEACHING" | "ADMIN" | "CONTRACT" | "NYSC"
  status: "ACTIVE" | "ON_LEAVE" | "SUSPENDED" | "RESIGNED" | "TERMINATED" | "RETIRED"
  role: string
  firstName: string
  middleName: string | null
  lastName: string
  email: string
  phone: string | null
  avatarUrl: string | null
  gender: "MALE" | "FEMALE" | "OTHER" | null
  dateOfBirth: string | null
  stateOfOrigin: string | null
  hireDate: string
  department: string | null
  qualification: string | null
  experienceYears: number
  salaryGrade: string | null
  basicSalary: number | null
  allowances: { name: string; amount: number }[]
  deductions: { name: string; amount: number }[]
  bankName: string | null
  accountNumber: string | null
  accountName: string | null
  subjects: { id: string; name: string; code: string }[]
}
