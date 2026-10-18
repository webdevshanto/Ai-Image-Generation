import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { ExternalServiceError } from '../utils/api-error.js';

let transporter: Transporter | undefined;

function getTransporter() {
  const hasAuth = Boolean(env.SMTP_USER && env.SMTP_PASSWORD);
  const isConfigured = Boolean(
    env.SMTP_HOST && env.EMAIL_FROM && (!env.SMTP_USER || hasAuth),
  );

  if (!isConfigured) {
    if (env.NODE_ENV === 'development') return null;
    throw new ExternalServiceError('SMTP email delivery is not configured');
  }

  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: hasAuth
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
  });

  return transporter;
}

export async function sendAuthEmail(to: string, subject: string, text: string) {
  const mailer = getTransporter();

  if (!mailer) {
    console.info(`[EMAIL PREVIEW]\nTo: ${to}\nSubject: ${subject}\n\n${text}`);
    return;
  }

  try {
    await mailer.sendMail({ from: env.EMAIL_FROM, to, subject, text });
  } catch {
    throw new ExternalServiceError('Could not send the authentication email');
  }
}
