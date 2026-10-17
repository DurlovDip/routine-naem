import { catalogFromModules, formatModuleCode, normalizeModuleNumber, normalizeSubNumber } from "./lib/text";
import type { AppState, ModuleEntry } from "./lib/types";

export function withModules(state: AppState, modules: ModuleEntry[]): AppState {
  const catalog = catalogFromModules(modules);
  return {
    ...state,
    modules,
    moduleNumbers: catalog.moduleNumbers,
    subNumbers: catalog.subNumbers,
  };
}

export function addModuleEntry(
  state: AppState,
  input: { number: string; sub: string; name: string },
): AppState {
  const moduleNumber = normalizeModuleNumber(input.number);
  const subNumber = normalizeSubNumber(input.sub);
  if (!moduleNumber) return state;
  const nums = state.modules
    .map((module) => parseInt(module.id.replace(/\D/g, ""), 10))
    .filter((num) => Number.isFinite(num) && num > 0);
  const id = String((nums.length ? Math.max(...nums) : 0) + 1);
  const name = input.name.trim();
  const entry: ModuleEntry = {
    id,
    moduleNumber: moduleNumber.replace(/^M-/, ""),
    moduleSubnumber: subNumber.replace(/^\./, ""),
    moduleName: name,
    code: formatModuleCode(moduleNumber, subNumber),
    title: name,
  };
  return withModules(state, [...state.modules, entry]);
}
