'use client';

import {
  Box,
  Button,
  Flex,
  Input,
  Link,
  Spinner,
  Text,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import Card from 'components/card/Card';
import { Icon } from '@chakra-ui/react';
import { MdCheckCircle, MdError, MdSettings, MdSend } from 'react-icons/md';
import { useCallback, useEffect, useState } from 'react';

const SANDBOX_NUMBER = '+1 415 523 8886';
const SANDBOX_JOIN_PHRASE =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_TWILIO_SANDBOX_JOIN_PHRASE || 'your-sandbox-word')
    : 'your-sandbox-word';

export default function DemoSetupCard() {
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const successColor = useColorModeValue('green.600', 'green.400');
  const errorColor = useColorModeValue('red.600', 'red.400');
  const toast = useToast();

  const [pythonOk, setPythonOk] = useState<boolean | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);

  const checkPython = useCallback(async () => {
    try {
      const res = await fetch('/api/camera-stream?check=1');
      const data = await res.json();
      setPythonOk(data?.available === true);
    } catch {
      setPythonOk(false);
    }
  }, []);

  useEffect(() => {
    checkPython();
    const t = setInterval(checkPython, 10000);
    return () => clearInterval(t);
  }, [checkPython]);

  const defaultPhone =
    typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_DEMO_PHONE || '' : '';
  const phoneToUse = testPhone.trim() || defaultPhone;

  const onTestSend = useCallback(async () => {
    if (!phoneToUse) {
      toast({ title: 'Enter a phone number first', status: 'warning', isClosable: true });
      return;
    }
    setTesting(true);
    try {
      const res = await fetch('/api/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phoneToUse,
          message: '🟢 Test: Smart Attendance demo – WhatsApp is working!',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: 'Message sent',
          description: `WhatsApp delivered to ${phoneToUse}`,
          status: 'success',
          isClosable: true,
        });
      } else {
        toast({
          title: 'Send failed',
          description: data?.error || 'Check Twilio config and sandbox join',
          status: 'error',
          duration: 8000,
          isClosable: true,
        });
      }
    } catch (e) {
      toast({
        title: 'Request failed',
        description: e instanceof Error ? e.message : 'Network error',
        status: 'error',
        isClosable: true,
      });
    } finally {
      setTesting(false);
    }
  }, [phoneToUse, toast]);

  const StatusRow = ({
    label,
    ok,
    loading,
  }: {
    label: string;
    ok: boolean | null;
    loading?: boolean;
  }) => (
    <Flex align="center" gap="2" py="1">
      {loading ? (
        <Spinner size="sm" />
      ) : ok ? (
        <Icon as={MdCheckCircle} color={successColor} boxSize="5" />
      ) : (
        <Icon as={MdError} color={errorColor} boxSize="5" />
      )}
      <Text fontSize="sm" color={textColor}>
        {label}: {loading ? 'Checking…' : ok ? 'OK' : 'Not connected'}
      </Text>
    </Flex>
  );

  return (
    <Card p="0" w="100%" overflow="hidden">
      <Box
        w="100%"
        px="20px"
        py="16px"
        borderBottom="1px solid"
        borderColor={borderColor}
        display="flex"
        alignItems="center"
        gap="2"
      >
        <Icon as={MdSettings} w="20px" h="20px" color="brand.500" />
        <Text color={textColor} fontSize="md" fontWeight="600">
          Demo Setup (3 Steps)
        </Text>
      </Box>
      <Box px="20px" py="16px">
        <Flex direction="column" gap="6">
          {/* Step 1: System Status */}
          <Box>
            <Text color={textColor} fontWeight="600" fontSize="sm" mb="2">
              Step 1: System Status
            </Text>
            <StatusRow label="Dashboard" ok={true} />
            <StatusRow label="Python Backend" ok={pythonOk} loading={pythonOk === null} />
            <StatusRow label="Camera Stream" ok={pythonOk} />
            {pythonOk === false && (
              <Text fontSize="xs" color="gray.500" mt="2">
                Start the Python attendance engine: scripts\start-attendance.bat
              </Text>
            )}
          </Box>

          {/* Step 2: Twilio Sandbox */}
          <Box>
            <Text color={textColor} fontWeight="600" fontSize="sm" mb="2">
              Step 2: Twilio Sandbox (Free Trial)
            </Text>
            <Text fontSize="xs" color="gray.500" mb="2">
              To receive attendance alerts, send <strong>join {SANDBOX_JOIN_PHRASE}</strong> to{' '}
              <strong>{SANDBOX_NUMBER}</strong> from your WhatsApp.
            </Text>
            <Link
              href="https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn"
              isExternal
              fontSize="xs"
              color="blue.500"
            >
              Get join phrase from Twilio Console →
            </Link>
            <Flex gap="2" mt="3" align="center" flexWrap="wrap">
              <Input
                placeholder="Recipient phone (e.g. 919876543210)"
                size="sm"
                maxW="220px"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
              />
              <Button
                size="sm"
                colorScheme="green"
                leftIcon={testing ? <Spinner size="sm" /> : <Icon as={MdSend} />}
                onClick={onTestSend}
                isLoading={testing}
              >
                Test WhatsApp
              </Button>
            </Flex>
          </Box>

          {/* Step 3: Live Event Log */}
          <Box>
            <Text color={textColor} fontWeight="600" fontSize="sm" mb="2">
              Step 3: Live Event Log
            </Text>
            <Text fontSize="xs" color="gray.500">
              Faces detected and messages dispatched appear in the Notifications table below. Scroll
              down to see the live feed.
            </Text>
          </Box>
        </Flex>
      </Box>
    </Card>
  );
}
