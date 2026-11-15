import React from 'react';
import { SmartNumericInput } from './SmartNumericInput.tsx';
import type { SmartNumericInputProps } from './SmartNumericInput.tsx';

export { SmartNumericInput };
export type { SmartNumericInputProps };

export type NumericSpinInputProps = SmartNumericInputProps;

export const NumericSpinInput: React.FC<NumericSpinInputProps> = (props) => {
  return <SmartNumericInput {...props} />;
};

