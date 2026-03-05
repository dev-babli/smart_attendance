import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { addLog, updateLogStatus } from 'lib/demoStore';
import { requireApiKey } from 'lib/apiAuth';
import { sendHelloWorld, sendAttendanceNotification } from 'lib/whatsapp';
import { sendTwilioWhatsAppText, sendTwilioAppointmentReminder } from 'lib/twilio-whatsapp';

export type AttendanceEventBody = {
  student_name: string;
  phone: string;
  time: string;
  tenant_id: string;
};

export async function POST(request: NextRequest) {
  const auth = requireApiKey(request);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Invalid or missing X-API-Key' }, { status: 401 });
  }
  try {
    const body = (await request.json()) as AttendanceEventBody;
    const { student_name, phone, time, tenant_id } = body;
    if (!student_name || !phone || !time || !tenant_id) {
      return NextResponse.json(
        { error: 'Missing student_name, phone, time, or tenant_id' },
        { status: 400 }
      );
    }

    const entry = await addLog({
      tenant_id,
      student_name,
      phone,
      time,
      status: 'pending',
    });

    const now = new Date();
    // Convert to IST (UTC+5:30)
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const ist = new Date(utc + 3600000 * 5.5);
    const today = ist.toLocaleDateString('en-IN', { month: 'numeric', day: 'numeric' });
    let result;

    const hasTwilio = !!process.env.TWILIO_ACCOUNT_SID;
    const hasMeta = !!process.env.WHATSAPP_ACCESS_TOKEN;

    if (hasTwilio) {
      const attendanceMsg = `🟢 Alert: ${student_name} has safely arrived at ${time}.`;
      result = await sendTwilioWhatsAppText(phone, attendanceMsg);
      
      // Fallback to template if free-form fails (e.g. outside 24h window)
      if (!result.success) {
        result = await sendTwilioAppointmentReminder(phone, today, time);
      }
    } else {
      result = { success: false, error: 'Twilio not configured' };
    }

    // Fallback to Meta (Cloud API) if configured
    if (!result.success && hasMeta) {
      result = await sendAttendanceNotification(phone, student_name, time);
      if (!result.success) {
        result = await sendHelloWorld(phone);
      }
    }

    if (!result.success && !hasTwilio && !hasMeta) {
      // Production behaviour: explicit failure when no provider is configured
      result = { success: false, error: 'No WhatsApp provider configured (set TWILIO_* or WHATSAPP_ACCESS_TOKEN)' };
    }

    if (result.success) {
      await updateLogStatus(entry.id, 'sent');
      setTimeout(() => updateLogStatus(entry.id, 'delivered'), 3000);
    } else {
      await updateLogStatus(entry.id, 'failed', result.error ?? undefined);
    }

    return NextResponse.json({
      id: entry.id,
      status: result.success ? 'sent' : 'failed',
      error: result.error,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
