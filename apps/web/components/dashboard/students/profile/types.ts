export type GuardianDTO = {
  id: string
  firstName: string
  lastName: string
  relationship: string | null
  phone: string | null
  email: string | null
  occupation: string | null
  address: string | null
  isPrimary: boolean
  isEmergencyContact: boolean
  canPickup: boolean
}

export type FeeInvoiceDTO = {
  id: string
  invoiceNo: string
  amountDue: number
  amountPaid: number
  status: string
  dueDate: string
  termType: string
  payments: { id: string; amount: number; channel: string; paidAt: string }[]
}

export type DocumentDTO = {
  id: string
  kind: string
  label: string | null
  url: string
  createdAt: string
}

export type StudentDTO = {
  id: string
  admissionNumber: string
  admissionDate: string
  admissionType: string
  status: string
  firstName: string
  lastName: string
  middleName: string | null
  avatarUrl: string | null
  email: string | null
  phone: string | null
  dateOfBirth: string
  gender: "MALE" | "FEMALE" | "OTHER"
  religion: string | null
  bloodGroup: string | null
  genotype: string | null
  stateOfOrigin: string | null
  lga: string | null
  nationality: string
  previousSchool: string | null
  previousClass: string | null
  reasonForTransfer: string | null
  address: string | null
  knownAllergies: string | null
  disabilities: string | null
  specialNeeds: string | null
  doctorName: string | null
  doctorPhone: string | null
  medicalInsurance: string | null
  emergencyMedicalConsent: boolean
  enrollment: {
    className: string
    sectionName: string
    academicYearName: string
    enrolledOn: string
  } | null
  guardians: GuardianDTO[]
  riskScores: { level: string; score: number; computedAt: string }[]
  feeBalance: number
  feeInvoices: FeeInvoiceDTO[]
  documents: DocumentDTO[]
}
