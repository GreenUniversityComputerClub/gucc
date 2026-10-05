"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { insertMention, matchPeople, mentionQueryAt, presentIn, type Mention } from "@/lib/chat/mentions";

/** Someone who can be mentioned here ("everyone" has the id "*"). */
export interface MentionCandidate {
  u: string;
  name: string;
  handle?: string | null;
  avatarUrl?: string | null;
  /** A short line under the name ("Group admin", "Notify everyone"). */
  hint?: string | null;
}

/**
 * Typing "@" in a message box: the people whose names match, chosen with ↑ ↓ and Enter or Tab
 * (Esc closes), or a tap. The text gets "@Full Name "; the message carries who it is, as long as
 * that text stays in it.
 */
export function useMentions({ value, setValue, input, candidates, initial = [] }: {
  value: string;
  setValue: (v: string) => void;
  input: React.RefObject<HTMLTextAreaElement | null>;
  candidates: MentionCandidate[];
  initial?: Mention[];
}) {
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<Mention[]>(initial);
  const listId = useId();
  const matches = useMemo(() => (query ? matchPeople(candidates, query.query, 8) : []), [candidates, query]);
  const open = matches.length > 0;

  /** Call after every change or caret move. */
  const track = useCallback((text: string, caret: number | null) => {
    const q = caret === null ? null : mentionQueryAt(text, caret);
    setQuery((cur) => (cur?.start === q?.start && cur?.query === q?.query ? cur : q));
    setActive(0);
  }, []);

  const choose = useCallback((c: MentionCandidate) => {
    const el = input.current;
    if (!query) return;
    const caret = el?.selectionStart ?? value.length;
    const next = insertMention(value, query.start, caret, c.name);
    setValue(next.text);
    setPicked((p) => [...p.filter((x) => x.u !== c.u), { u: c.u, n: c.name, h: c.handle ?? null }]);
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(next.caret, next.caret);
    });
  }, [input, query, setValue, value]);

  /** Keys while the list is open; true when the key was used here. */
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!open || e.nativeEvent.isComposing) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      choose(matches[active] ?? matches[0]!);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setQuery(null);
      return true;
    }
    return false;
  }, [active, choose, matches, open]);

  const mentions = useMemo(() => presentIn(value, picked), [value, picked]);
  const reset = useCallback(() => {
    setPicked([]);
    setQuery(null);
  }, []);

  /** Props for the textarea: it points at the list and the highlighted person (a textarea can't be a combobox). */
  const inputProps = {
    "aria-autocomplete": "list" as const,
    "aria-controls": open ? listId : undefined,
    "aria-activedescendant": open ? `${listId}-${active}` : undefined,
  };

  return { open, matches, active, setActive, choose, onKeyDown, track, mentions, reset, listId, inputProps, typing: query !== null };
}
