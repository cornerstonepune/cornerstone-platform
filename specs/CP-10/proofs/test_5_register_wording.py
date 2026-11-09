"""CP-10 item 5: the data register's voice entry says, in Nimish's words of 9 Nov, how long a voice note is kept. The voice
entry is the register entry that lists the voice notes' table (pii.educator_note). The words must stand in one of its
fields exactly as decided, and nothing in the register may still say recordings are kept and not deleted."""

import json

from conftest import ROOT

WORDS = ("A short voice note is kept for 48 hours so the educator can check it, then we delete the recording and its "
         "words from our system. What the educator confirms stays in her class's records while your child is at the "
         "school. The speech service receives the recording only, never your child's name.")


def test_5_the_voice_entry_says_the_decided_words():
    register = json.loads((ROOT / "supabase" / "seed" / "data_register.json").read_text())["data_register"]
    voice = [e for e in register if "pii.educator_note" in e.get("tables", [])]
    assert len(voice) == 1, "one entry holds the voice notes"
    fields = [v for v in voice[0].values() if isinstance(v, str)]
    assert any(WORDS in f for f in fields), f"the voice entry does not say the decided words: {voice[0]}"
    everything = json.dumps(register).lower()
    assert "recordings are kept and not deleted" not in everything, "the register still says recordings are kept"
