import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

type FieldProps = { id: string; label: string; hint?: string; error?: string };

export function TextField({ id, label, hint, error, ...props }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">{label}</label>
      <input
        id={id}
        name={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        aria-invalid={error ? true : undefined}
        className="min-h-12 rounded-lg border-2 border-line px-3 text-lg"
        {...props}
      />
      {hint ? <p id={`${id}-hint`} className="text-base text-muted">{hint}</p> : null}
      {error ? <p className="text-base text-danger">{error}</p> : null}
    </div>
  );
}

export function TextArea({ id, label, hint, ...props }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">{label}</label>
      <textarea id={id} name={id} rows={3} className="rounded-lg border-2 border-line px-3 py-2 text-lg" {...props} />
      {hint ? <p className="text-base text-muted">{hint}</p> : null}
    </div>
  );
}

export function SelectField({
  id,
  label,
  children,
  ...props
}: FieldProps & React.SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">{label}</label>
      <select id={id} name={id} className="min-h-12 rounded-lg border-2 border-line bg-paper px-3 text-lg" {...props}>
        {children}
      </select>
    </div>
  );
}
