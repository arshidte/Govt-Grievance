import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from './avatar';

describe('Avatar', () => {
  it('renders an <img> with alt text when src is provided', () => {
    render(<Avatar name="Asha Kumari" src="https://example.test/a.png" />);

    const img = screen.getByRole('img', { name: 'Asha Kumari' });
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', 'https://example.test/a.png');
  });

  it('renders initials with an accessible label when no src is given', () => {
    render(<Avatar name="Asha Kumari" />);

    const avatar = screen.getByRole('img', { name: 'Asha Kumari' });
    expect(avatar.tagName).not.toBe('IMG');
    expect(avatar).toHaveTextContent('AK');
  });

  it('derives two uppercase initials from a single word', () => {
    render(<Avatar name="asha" />);

    expect(screen.getByTestId('avatar')).toHaveTextContent('AS');
  });

  it('falls back gracefully when no name is given', () => {
    render(<Avatar />);

    const avatar = screen.getByTestId('avatar');
    expect(avatar).toHaveTextContent('');
    expect(avatar).not.toHaveAttribute('aria-label');
  });
});
