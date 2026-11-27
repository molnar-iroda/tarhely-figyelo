import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mailboxKey, matchesSkipPattern, matchingType, planMailboxes } from "../src/mailbox-rules.ts";

const MAILBOXES = [
  { name: "Értesítési tárhely (varga.julianna@example.com)" },
  { name: "AB Corpus 22690692" },
  { name: "28984995 (Steffens Kft)" },
  { name: "Ács Termál Kertészet 10688230" }
];

describe("postafiók-szabályok", () => {
  it("a postafiókot a törzsszáma azonosítja, akárhogy írták be", () => {
    assert.equal(mailboxKey("AB Corpus 22690692"), "22690692");
    assert.equal(mailboxKey("22690692-2-41 - AB Corpus Korlátolt Felelősségű Társaság"), "22690692");
    assert.equal(matchesSkipPattern("AB Corpus 22690692", "22690692 - AB Corpus Kft."), true);
    assert.equal(matchesSkipPattern("AB Corpus 22690692", "10688230 - Ács Termál"), false);
    assert.equal(matchesSkipPattern("Értesítési tárhely (x@example.com)", "értesítési"), true);
  });

  it("szabály, majd a régi kihagyási lista, végül letöltés", () => {
    const plans = planMailboxes(MAILBOXES, {
      skipMailboxes: ["22690692 - AB Corpus Korlátolt Felelősségű Társaság"],
      mailboxRules: [
        { mailbox: "28984995 - Steffens", mode: "ertesites", recipients: ["juli@example.com"] },
        { mailbox: "Ács Termál Kertészet 10688230", mode: "letoltes", recipients: ["kati@example.com"] }
      ]
    });
    assert.deepEqual(plans.map((plan) => plan.mode), ["letoltes", "kihagy", "ertesites", "letoltes"]);
    assert.deepEqual(plans[2]?.recipients, ["juli@example.com"]);
    assert.deepEqual(plans[3]?.recipients, ["kati@example.com"]);
  });

  it("az üzenettípus ékezet- és szóközfüggetlenül illeszkedik", () => {
    assert.equal(matchingType(["Feladási igazolás"], "FeladasiIgazolas", ""), "Feladási igazolás");
    assert.equal(matchingType(["KNYLEK"], "Elfogadó nyugta", "KNYLEK, Elfogadott bizonylat"), "KNYLEK");
    assert.equal(matchingType(["Végzés"], "Elfogadó nyugta", "UJEGYKE"), undefined);
    assert.equal(matchingType([" "], "bármi", ""), undefined);
  });
});
