import type { Metadata } from "next";
import FlightGame from "@/components/flight/FlightGame";

export const metadata: Metadata = {
  title: "JobMap Flight — St. Louis",
};

export default function FlyPage() {
  return <FlightGame />;
}
