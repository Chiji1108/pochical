import type { FC } from "react";

export type NativeDatePickerProps = {
  isPresented: boolean;
  onDateChange: (date: Date) => void;
  onIsPresentedChange: (isPresented: boolean) => void;
  value: Date;
};

export const NativeDatePicker: FC<NativeDatePickerProps> = () => null;
