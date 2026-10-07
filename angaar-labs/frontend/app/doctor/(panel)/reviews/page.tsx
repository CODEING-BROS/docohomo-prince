"use client";

import { useQuery } from "@tanstack/react-query";
import { MessageSquareText, Star } from "lucide-react";
import { PageHeader } from "@/components/admin/parts";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Reviews = {
  average: number; count: number; stars: { rating: number; count: number }[];
  items: { id: number; rating: number; comment: string | null; createdAt: string; patientName: string; appointmentNumber: string }[];
};

function StarRow({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={cn("size-4", n <= Math.round(rating) ? "fill-warning text-warning" : "text-muted-foreground/30")} />)}
    </span>
  );
}

export default function DoctorReviewsPage() {
  const { data, isPending } = useQuery({ queryKey: ["doctor-reviews"], queryFn: () => api<Reviews>("/doctor/reviews") });

  return (
    <>
      <PageHeader title="Patient reviews" description="What patients said after their consultation with you." />
      {isPending || !data ? <Skeleton className="h-72 rounded-xl" /> : data.count === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><MessageSquareText className="size-5" /></span>
          <p className="font-medium">No reviews yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">After each finished consultation the patient can rate you and leave a comment. Their reviews appear here.</p>
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[18rem_1fr]">
          <Card className="lg:sticky lg:top-20">
            <CardContent className="grid gap-4">
              <div className="text-center">
                <p className="text-5xl font-semibold ledger">{data.average.toFixed(1)}</p>
                <StarRow rating={data.average} className="mt-2" />
                <p className="mt-1 text-sm text-muted-foreground">{data.count} review{data.count === 1 ? "" : "s"}</p>
              </div>
              <ul className="grid gap-1.5">
                {data.stars.map((row) => (
                  <li key={row.rating} className="flex items-center gap-2 text-sm">
                    <span className="w-3 ledger">{row.rating}</span><Star className="size-3.5 fill-warning text-warning" />
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-warning" style={{ width: `${(row.count / data.count) * 100}%` }} /></span>
                    <span className="w-6 text-right text-muted-foreground ledger">{row.count}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <div className="grid gap-3">
            {data.items.map((review) => (
              <Card key={review.id}>
                <CardContent className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StarRow rating={review.rating} />
                    <span className="text-sm font-medium">{review.patientName}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{formatDate(review.createdAt)} · {review.appointmentNumber}</span>
                  </div>
                  {review.comment ? <p className="text-sm whitespace-pre-line text-muted-foreground">{review.comment}</p> : <p className="text-sm text-muted-foreground italic">No comment</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
