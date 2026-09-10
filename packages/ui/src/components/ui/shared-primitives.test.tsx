import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { PageHeader } from './page-header';

describe('shared console primitives', () => {
  it('gives primary actions a comfortable touch target and pill silhouette', () => {
    render(<Button>Protect your brand</Button>);

    expect(
      screen.getByRole('button', { name: 'Protect your brand' }),
    ).toHaveClass('h-11', 'rounded-full');
  });

  it('stacks page actions before returning to a horizontal desktop layout', () => {
    render(
      <PageHeader
        title="Products"
        description="Catalog products"
        actions={<Button>New product</Button>}
      />,
    );

    expect(
      screen.getByText('Products').parentElement?.parentElement,
    ).toHaveClass('flex-col', 'sm:flex-row');
  });
});
