import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Username from '@/components/CredentialPage/FormInputs/Username';
import ForgotForm from '@/components/CredentialPage/ForgotForm';
import { usernameHelp } from '@/lib/usernameHelp';

describe('username clarification (existing rules, no validation change)', () => {
  it('explains spaces, underscores and hyphen/length rules beside the login/signup input', () => {
    render(<Username I={{}} />);
    expect(screen.getByLabelText('Username')).toHaveAccessibleDescription(usernameHelp);
    expect(screen.getByText(/No spaces or underscores/)).toBeVisible();
    expect(screen.getByLabelText('Username')).not.toHaveAttribute('pattern');
  });

  it('also explains the rules when creating an account through phone/email sign-in', () => {
    render(<ForgotForm I={{ recoveryStep: 'pick', recoveryAccounts: [] }} />);
    expect(screen.getByTestId('recovery-new-username')).toHaveAccessibleDescription(usernameHelp);
  });
});
