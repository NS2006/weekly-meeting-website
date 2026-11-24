import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export type BlueSize = 'sm' | 'md' | 'lg';
export type BlueButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger';
export type BlueAlertVariant = 'info' | 'success' | 'warning' | 'error';
export type BlueBadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

export interface BlueButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BlueButtonVariant;
  size?: BlueSize;
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

export interface BlueInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
}

export interface BlueCardProps {
  title?: string;
  header?: ReactNode;
  footer?: ReactNode;
  bordered?: boolean;
  hoverable?: boolean;
  children: ReactNode;
  className?: string;
}

export interface BlueAlertProps {
  variant?: BlueAlertVariant;
  title?: string;
  onDismiss?: () => void;
  children: ReactNode;
  className?: string;
}

export interface BlueBadgeProps {
  variant?: BlueBadgeVariant;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}
