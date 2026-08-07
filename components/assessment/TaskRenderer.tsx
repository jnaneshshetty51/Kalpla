"use client";

import React from "react";
import { AssessmentTaskItem } from "@/types/assessment";
import { MultipleChoiceTask } from "./MultipleChoiceTask";
import { ShortAnswerTask } from "./ShortAnswerTask";
import { PromptWritingTask } from "./PromptWritingTask";
import { CodingTask } from "./CodingTask";

export interface TaskRendererProps {
  task: AssessmentTaskItem;
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}

export function TaskRenderer({
  task,
  value,
  onChange,
  disabled = false,
}: TaskRendererProps) {
  if (!task) return null;

  const taskType = task.type;
  // Explicit signal only — matching on category or substrings like "prompt"
  // in the prompt text misfired on purely explanatory questions (e.g. a
  // "Prompt Engineering" category question just asking the candidate to
  // explain zero-shot vs. few-shot rendered the prompt-writing editor UI
  // even though the task never asks them to write a prompt). A task author
  // opts into this renderer explicitly via rubric.render_hint.
  const isPromptTask = task.rubric?.render_hint === "prompt_writing";

  if (taskType === "multiple_choice") {
    return (
      <MultipleChoiceTask
        task={task}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (taskType === "code") {
    return (
      <CodingTask
        task={task}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (isPromptTask && taskType === "short_answer") {
    return (
      <PromptWritingTask
        task={task}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  return (
    <ShortAnswerTask
      task={task}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
