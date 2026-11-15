import {describe,it,expect} from "vitest";
import {chooseSpecialist,switchFocus} from "../lib/core/spatial-specialists";
describe("focus switching",()=>{
 it("navigates exact files",()=>expect(chooseSpecialist("Where is that file?")).toBe("fix_navigator"));
 it("verifies CI evidence",()=>expect(chooseSpecialist("Did CI pass?")).toBe("evidence_verifier"));
 it("carries task context",()=>expect(switchFocus({active:"code_scout",taskId:"t1",contextVersion:3},"fix_navigator")).toEqual({active:"fix_navigator",taskId:"t1",contextVersion:3}));
});
