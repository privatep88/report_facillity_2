import React from 'react';
import { SmartNumericInput } from './SmartNumericInput.tsx';
import type { SmartNumericInputProps } from './SmartNumericInput.tsx';

export { SmartNumericInput };
export type { SmartNumericInputProps };

export const NumericSpinInput = SmartNumericInput;
export type NumericSpinInputProps = SmartNumericInputProps;
export type NumericInputProps = SmartNumericInputProps;

export const NumericInput: React.FC<NumericInputProps> = (props) => {
  return <SmartNumericInput {...props} />;
};


