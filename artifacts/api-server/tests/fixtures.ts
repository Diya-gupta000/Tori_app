import type { BoardRead } from "../src/lib/board-reader";

export const roster = [
  ["alyssa-chintan", "Alyssa & Chintan", ["Alyssa", "Chintan"]],
  ["amanda-david", "Amanda & David", ["Amanda", "David"]],
  ["aria-noa-arna", "Aria, Noa, & Arna", ["Aria", "Noa", "Arna"]],
  ["eliana-maria", "Eliana & Maria", ["Eliana", "Maria"]],
  ["jack-andy-roya", "Jack, Andy, & Roya", ["Jack", "Andy", "Roya"]],
  ["jason-erin", "Jason & Erin", ["Jason", "Erin"]],
  ["jason-k", "Jason K.", ["Jason K."]],
  ["katelyn-audrey", "Katelyn & Audrey", ["Katelyn", "Audrey"]],
  ["kyla-zahra-milena", "Kyla, Zahra, & Milena", ["Kyla", "Zahra", "Milena"]],
  ["maya-yaretzi", "Maya & Yaretzi", ["Maya", "Yaretzi"]],
  ["phoebe-diya", "Phoebe & Diya", ["Phoebe", "Diya"]],
  ["pranav-isaac", "Pranav & Isaac", ["Pranav", "Isaac"]],
  ["sarp-ricky", "Sarp & Ricky", ["Sarp", "Ricky"]],
  ["tessa-nisma", "Tessa & Nisma", ["Tessa", "Nisma"]],
].map(([id, name, students]) => ({ id: id as string, name: name as string, students: students as string[] }));

export const noEvidence = { blocked: false, needsAttention: false, complete: false, reason: null };
export function extracted(name = "Phoebe & Diya", students = ["Phoebe", "Diya"], task = "Email E-mentors"): BoardRead["groups"][number] {
  return { name, students, project: "Research project", progress: 45, currentFocus: task,
    blocker: null, phase: "background research", summary: task,
    workItems: [{ title: task, details: null }], statusEvidence: { ...noEvidence } };
}
export function board(groups = [extracted()]): BoardRead {
  return { summary: "Weekly research work", wins: [], attentionItems: [], groups };
}
