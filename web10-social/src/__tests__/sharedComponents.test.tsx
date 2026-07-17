import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Branding from '../components/shared/Branding';
import { Icon, RawIcon } from '../components/shared/Icon';

// Mock rectangles-npm BEFORE importing any components that use it
vi.mock('rectangles-npm', () => {
  const R = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="R">{children}</div>
  );
  const C = ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <div data-testid="C" onClick={onClick}>
      {children}
    </div>
  );
  return { R, C, pass: (props: Record<string, unknown>) => props };
});

describe('Branding', () => {
  it('renders the web10 social branding text', () => {
    render(<Branding />);
    expect(screen.getByText(/web10 - social/i)).toBeInTheDocument();
  });

  it('renders as a heading', () => {
    render(<Branding />);
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
  });
});

describe('Icon', () => {
  it('renders with correct font-awesome class', () => {
    render(<Icon>bars</Icon>);
    const icon = document.querySelector('.fa-bars');
    expect(icon).toBeInTheDocument();
  });

  it('calls onClick handler', () => {
    const onClick = vi.fn();
    render(<Icon onClick={onClick}>moon</Icon>);
    const container = screen.getByTestId('C');
    fireEvent.click(container);
    expect(onClick).toHaveBeenCalled();
  });

  it('renders without onClick', () => {
    render(<Icon>home</Icon>);
    const icon = document.querySelector('.fa-home');
    expect(icon).toBeInTheDocument();
  });
});

describe('RawIcon', () => {
  it('renders with correct font-awesome-solid class', () => {
    render(<RawIcon>trash</RawIcon>);
    const icon = document.querySelector('.fa-solid.fa-trash');
    expect(icon).toBeInTheDocument();
  });

  it('calls onClick handler', () => {
    const onClick = vi.fn();
    render(<RawIcon onClick={onClick}>square-check</RawIcon>);
    const container = screen.getByTestId('C');
    fireEvent.click(container);
    expect(onClick).toHaveBeenCalled();
  });
});
