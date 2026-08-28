import { describe, expect, it } from "vitest"

import { looksLikeBackupCode } from "@/lib/backup-codes"

describe("looksLikeBackupCode", () => {
  it("recognises the issued format", () => {
    expect(looksLikeBackupCode("ABCDE-FGHJK")).toBe(true)
  })

  it("recognises it without the dash or case", () => {
    expect(looksLikeBackupCode("abcdefghjk")).toBe(true)
    expect(looksLikeBackupCode(" ABCDE FGHJK ")).toBe(true)
  })

  it("does not mistake a 6-digit TOTP code for one", () => {
    expect(looksLikeBackupCode("123456")).toBe(false)
  })

  it("rejects the wrong length", () => {
    expect(looksLikeBackupCode("ABCDE-FGHJKL")).toBe(false)
    expect(looksLikeBackupCode("")).toBe(false)
  })
})
