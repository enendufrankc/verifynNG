import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReportForm } from './ReportForm';

const meta: Meta<typeof ReportForm> = {
  title: 'Reports/ReportForm',
  component: ReportForm,
};
export default meta;

type Story = StoryObj<typeof ReportForm>;

export const RedVerdict: Story = {
  args: {
    tenantSlug: 'ivoryglow',
    scanEventId: 'REPLACE_WITH_SEEDED_SCAN_EVENT_ID',
    verdict: 'red',
    apiBaseUrl: 'http://localhost:4000',
    onSubmitted: (reference) => alert(`Submitted: ${reference}`),
  },
};
