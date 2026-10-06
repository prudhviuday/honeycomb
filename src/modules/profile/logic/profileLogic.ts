export interface EditableProfile {
  display_name: string;
  city: string;
}

export function normalizeProfileInput(input: EditableProfile): EditableProfile {
  return {
    display_name: input.display_name.trim(),
    city: input.city.trim(),
  };
}

export function getDisplayName(displayName: string | null | undefined, email?: string | null): string {
  return displayName?.trim() || email?.split('@')[0] || 'Player';
}
