import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import MoreMenu, { ECOSYSTEM } from '@/components/shared/MoreMenu';
import { WEB10_HOME, WEB10_DOCS, WEB10_APP_STORE } from '@/lib/links';

afterEach(cleanup);

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'More' }));

describe('Hub "More" menu (the old sidebar\'s ecosystem destinations)', () => {
  it('is a closed trigger by default', () => {
    render(<MoreMenu />);
    const trigger = screen.getByRole('button', { name: 'More' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('topbar-more-menu')).not.toBeInTheDocument();
    expect(screen.queryByText('What is web10')).not.toBeInTheDocument();
  });

  it('opens to the three ecosystem destinations as new-tab external links', () => {
    render(<MoreMenu />);
    openMenu();
    const menu = screen.getByRole('menu', { name: 'More' });
    for (const [label, href] of [
      ['What is web10', WEB10_HOME],
      ['App Store', WEB10_APP_STORE],
      ['Docs', WEB10_DOCS],
    ]) {
      const link = within(menu).getByRole('menuitem', { name: label });
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('lists exactly the pinned destinations, in sidebar order', () => {
    expect(ECOSYSTEM.map((e) => e.label)).toEqual(['What is web10', 'App Store', 'Docs']);
  });

  it('closes when a destination is chosen', () => {
    render(<MoreMenu />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Docs' }));
    expect(screen.queryByTestId('topbar-more-menu')).not.toBeInTheDocument();
  });

  it('toggles closed by clicking the trigger again', () => {
    render(<MoreMenu />);
    openMenu();
    expect(screen.getByTestId('topbar-more-menu')).toBeInTheDocument();
    openMenu();
    expect(screen.queryByTestId('topbar-more-menu')).not.toBeInTheDocument();
  });

  it('closes on an outside click', () => {
    render(<MoreMenu />);
    openMenu();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('topbar-more-menu')).not.toBeInTheDocument();
  });

  it('keeps the sidebar footer credit in the menu footer', () => {
    render(<MoreMenu />);
    openMenu();
    const credit = screen.getByRole('link', { name: 'Jacob Hoffman' });
    expect(credit).toHaveAttribute('href', 'https://jacobhoffman.xyz');
    expect(credit).toHaveAttribute('target', '_blank');
    expect(screen.getByText(/Invented by/)).toBeInTheDocument();
  });
});
