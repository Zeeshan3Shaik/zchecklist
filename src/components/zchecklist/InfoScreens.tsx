const faqs: { q: string; a: string }[] = [
  { q: "What is ZChecklist?", a: "ZChecklist is a checklist and reporting app for classworks, homeworks, attendance, and anything else. Create a checklist, mark each member Done, Not Done, or Absent, and download a report." },
  { q: "Do I need an account?", a: "Yes. Your checklists are private and saved to your account, so they sync across devices. Sign up with your name, email, username, and password." },
  { q: "How many members can a checklist have?", a: "Between 1 and 100 members per checklist." },
  { q: "What does Absent mean?", a: "Absent is a status, not a deletion. The member stays in the grid, turns dark, and is counted separately in the report." },
  { q: "Can I name individual members?", a: "Yes. Click any member card and use Add Label to attach a name. Labels appear on the card, in reports, and in downloads." },
  { q: "What is a checklist framework?", a: "A framework is a reusable roster: member count plus optional names. Create it once, then load it each day instead of re-entering everything." },
  { q: "Is my data saved automatically?", a: "Yes. Every status change saves to the cloud immediately. If a save fails, your work is kept and you can retry." },
  { q: "Can I edit a completed report?", a: "Yes. Open it from History, choose Edit Report, change statuses, and the same report updates — no duplicate is created." },
  { q: "What downloads are available?", a: "Every report can be downloaded as a TXT file or a formatted Excel workbook with a summary sheet and an analytics sheet." },
  { q: "Who can see my checklists?", a: "Only you. Every record is tied to your account and protected by server-side access rules." },
];

export function AboutScreen() {
  return (
    <div className="anim-rise mx-auto w-full max-w-3xl px-4 pb-20 sm:px-6">
      <h1 className="text-4xl font-extrabold tracking-normal text-foreground sm:text-5xl">About ZChecklist</h1>
      <div className="glass mt-6 rounded-[28px] p-6 sm:p-8">
        <p className="text-lg font-semibold text-foreground">Hello everyone, this is Zeshan — I created this website.</p>
        <p className="mt-4 text-muted-foreground">
          ZChecklist helps teachers, team leads, and organizers keep track of people quickly and reliably. Whether it is
          daily attendance, homework collection, or classwork completion, you create a checklist, tap each member, and
          get a clean report you can download and share.
        </p>
        <h2 className="mt-6 text-xl font-bold text-foreground">How it works</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>Pick a date and a category: Classworks, Homeworks, Attendance, or Miscellaneous.</li>
          <li>Enter the number of members — or load a saved framework with names already filled in.</li>
          <li>Name your checklist and start marking: Done, Not Done, or Absent. Add a label to any member to remember who they are.</li>
          <li>Everything saves automatically as you work. Finish to get a report with counts, percentages, and full member lists.</li>
          <li>Download the report as TXT or Excel, revisit it any time in History, and spot trends in Analytics.</li>
        </ol>
        <h2 className="mt-6 text-xl font-bold text-foreground">The rules</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Checklists hold 1–100 members. Member numbers never change or disappear.</li>
          <li>Absent members stay visible and are never counted as Done or Not Done.</li>
          <li>Your data is private to your account and never shared with other users.</li>
          <li>Reports are only deleted when you delete them yourself.</li>
        </ul>
      </div>
    </div>
  );
}

export function FaqScreen() {
  return (
    <div className="anim-rise mx-auto w-full max-w-3xl px-4 pb-20 sm:px-6">
      <h1 className="text-4xl font-extrabold tracking-normal text-foreground sm:text-5xl">FAQs</h1>
      <div className="mt-6 flex flex-col gap-3">
        {faqs.map((f) => (
          <details key={f.q} className="glass rounded-[20px] px-5 py-4">
            <summary className="cursor-pointer text-base font-bold text-foreground">{f.q}</summary>
            <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
