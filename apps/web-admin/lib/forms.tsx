'use client';

import {
  useForm,
  FormProvider,
  type FieldValues,
  type DefaultValues,
  type Path,
  type UseFormReturn,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { type ZodSchema } from 'zod';
import { ApiError } from './api-client';

export function Form<T extends FieldValues>({
  form,
  onSubmit,
  className,
  children,
}: {
  form: UseFormReturn<T>;
  onSubmit: (values: T) => void | Promise<void>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <FormProvider {...form}>
      <form className={className} onSubmit={form.handleSubmit(onSubmit)}>
        {children}
      </form>
    </FormProvider>
  );
}

export function setServerErrors<T extends FieldValues>(
  form: ReturnType<typeof useForm<T>>,
  error: unknown,
) {
  if (error instanceof ApiError && error.details) {
    for (const detail of error.details) {
      form.setError(detail.field as Path<T>, {
        type: 'server',
        message: detail.message,
      });
    }
  }
}

export function useZodForm<T extends FieldValues>(
  schema: ZodSchema<T>,
  defaults?: DefaultValues<T>,
) {
  return useForm<T>({ resolver: zodResolver(schema), defaultValues: defaults });
}
