"use client";

import { DoctorForm, emptyDoctor } from "@/components/admin/doctor-form";

export default function NewDoctorPage() {
  return <DoctorForm initial={emptyDoctor} />;
}
