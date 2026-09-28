import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JOB_ROLES } from "@/lib/constants";

interface JobTitleSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function JobTitleSelect({ value, onChange, disabled = false }: JobTitleSelectProps) {
  // Saved custom titles must remain editable even though they are not in the preset list.
  // Keep "Other" selected while typing even if a partial custom title happens
  // to match a preset (e.g. "Director" before "Director, Corporate Partnerships").
  const [otherSelected, setOtherSelected] = useState(false);
  useEffect(() => {
    if (disabled) setOtherSelected(false);
  }, [disabled]);
  const isOther = otherSelected || value === "Other" || (!!value && !JOB_ROLES.includes(value));
  const selection = isOther ? "Other" : value || undefined;

  return (
    <>
      <Select
        value={selection}
        onValueChange={(role) => {
          setOtherSelected(role === "Other");
          onChange(role);
        }}
        disabled={disabled}
      >
        <SelectTrigger id="jobTitle" data-testid="select-job-title">
          <SelectValue placeholder="Select job title" />
        </SelectTrigger>
        <SelectContent>
          {JOB_ROLES.map((role) => (
            <SelectItem key={role} value={role}>{role}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isOther && (
        <div className="space-y-2">
          <Label htmlFor="customJobTitle">Your current job title</Label>
          <Input
            id="customJobTitle"
            data-testid="input-custom-job-title"
            value={value === "Other" ? "" : value}
            onChange={(event) => onChange(event.target.value || "Other")}
            placeholder="e.g. Director of Corporate Partnerships"
            maxLength={120}
            required={!disabled}
            disabled={disabled}
          />
        </div>
      )}
    </>
  );
}