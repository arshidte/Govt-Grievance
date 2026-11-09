import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NavItem, SidebarNav } from './sidebar-nav';

describe('NavItem', () => {
  it('renders the label and icon', () => {
    render(<NavItem label="Dashboard" icon={<svg data-testid="icon" />} href="/dashboard" />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('marks the active item with aria-current="page" and the selected style', () => {
    render(<NavItem label="Reports" active href="/reports" />);

    const item = screen.getByTestId('nav-item');
    expect(item).toHaveAttribute('aria-current', 'page');
    expect(item.className).toContain('bg-primary-600');
  });

  it('does not set aria-current when inactive', () => {
    render(<NavItem label="Reports" href="/reports" />);

    expect(screen.getByTestId('nav-item')).not.toHaveAttribute('aria-current');
  });

  it('fires onClick when activated', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<NavItem label="Settings" href="#" onClick={onClick} />);

    await user.click(screen.getByTestId('nav-item'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    render(<NavItem label="Settings" href="#" onClick={onClick} disabled />);

    const item = screen.getByTestId('nav-item');
    expect(item).toHaveAttribute('aria-disabled', 'true');
    // pointer-events are disabled, so dispatch the click directly to assert
    // the guard (not the CSS) blocks the handler.
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('slots the caller element under asChild while keeping the label', () => {
    render(
      <NavItem label="Home" asChild href="/ignored">
        <a href="/home" data-testid="link" />
      </NavItem>,
    );

    const link = screen.getByTestId('link');
    expect(link).toHaveAttribute('href', '/home');
    expect(within(link).getByText('Home')).toBeInTheDocument();
  });
});

describe('SidebarNav', () => {
  it('renders as a labelled navigation landmark with brand, children, and footer', () => {
    render(
      <SidebarNav
        aria-label="Main navigation"
        brand={<span>Brand</span>}
        footer={<span>Footer</span>}
      >
        <NavItem label="Dashboard" href="/dashboard" />
      </SidebarNav>,
    );

    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav).toBe(screen.getByTestId('sidebar-nav'));
    expect(within(nav).getByText('Brand')).toBeInTheDocument();
    expect(within(nav).getByText('Dashboard')).toBeInTheDocument();
    expect(within(nav).getByText('Footer')).toBeInTheDocument();
  });
});
