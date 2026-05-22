import NavBar from "@/components/NavBar";

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">{children}</main>
    </>
  );
}
