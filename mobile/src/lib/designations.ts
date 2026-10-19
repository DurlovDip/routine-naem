export const BUILTIN_DESIGNATIONS = [
  "Director General",
  "Director",
  "Deputy Director",
  "Assistant Director",
  "Professor",
  "Associate Professor",
  "Assistant Professor",
  "Lecturer",
  "Research Officer",
  "Guest Speaker",
] as const;

export function isMissingDesignationsTable(message: string): boolean {
  return /designations/i.test(message) && /does not exist|schema cache|could not find the table|PGRST205/i.test(message);
}

export function designationChoices(catalog: string[], extras: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  const add = (value: string | null | undefined) => {
    const name = value?.trim() ?? "";
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    names.push(name);
  };
  catalog.forEach(add);
  extras.forEach(add);
  return names;
}
