import type { FC } from "react";

export type NativeTimePickerProps = {
  isPresented: boolean;
  onDateChange: (date: Date) => void;
  onIsPresentedChange: (isPresented: boolean) => void;
  value: Date;
};

export const NativeTimePicker: FC<NativeTimePickerProps> = () => null;
