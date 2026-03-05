'use client';

import {
  Badge,
  Box,
  Button,
  Flex,
  SimpleGrid,
  Spinner,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tooltip,
  Tr,
  useColorModeValue,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import MiniStatistics from 'components/card/MiniStatistics';
import IconBox from 'components/icons/IconBox';
import Card from 'components/card/Card';
import BarChart from 'components/charts/BarChart';
import PieChart from 'components/charts/PieChart';
import { Icon } from '@chakra-ui/react';
import {
  MdPeople,
  MdSend,
  MdOutlineDoneAll,
  MdOutlineError,
  MdSchedule,
} from 'react-icons/md';
import {
  attendanceTimelineData,
  attendanceTimelineOptions,
  notificationSuccessPieData,
  notificationSuccessPieOptions,
} from 'views/admin/dashboard/variables/attendanceCharts';
import SendNotificationStepper from 'views/attendance/SendNotificationStepper';
import BiometricSimulator from 'components/biometric/BiometricSimulator';
import LiveFeedCard from 'components/camera/LiveFeedCard';
import FaceScanAnalysis from 'components/camera/FaceScanAnalysis';
import EnrolledFacesCard from 'components/camera/EnrolledFacesCard';
import EnrollmentInfoCard from 'components/camera/EnrollmentInfoCard';
import EnrollFaceCard from 'components/camera/EnrollFaceCard';
import DemoSetupCard from 'components/demo/DemoSetupCard';
import { useCampus, CAMPUS_OPTIONS } from 'contexts/CampusContext';
import { apiHeaders } from 'lib/apiClient';
import { useCallback, useEffect, useState } from 'react';

function CurrentTimeWidget() {
  const [time, setTime] = useState<string>('');
  const textColor = useColorModeValue('secondaryGray.900', 'white');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: true 
      }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card p="16px" alignItems="center" justifyContent="center" mb="20px">
      <Text color={textColor} fontSize="2xl" fontWeight="700">
        {time}
      </Text>
      <Text color="gray.500" fontSize="sm">
        Local Time
      </Text>
    </Card>
  );
}

type AttendanceLog = {
  id: string;
  tenant_id: string;
  student_name: string;
  phone: string;
  time: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  error_message?: string;
};

type Stats = {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  failed: number;
};

const DEMO_NAMES = [
  'Rahul Sharma',
  'Priya Patel',
  'Amit Kumar',
  'Sneha Reddy',
  'Vikram Singh',
  'Anita Desai',
  'Rajesh Nair',
  'Kavita Iyer',
  'Suresh Menon',
  'Deepa Krishnan',
];

function randomStudent(tenantId: string): { student_name: string; phone: string; time: string } {
  const name = DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)];
  const phone =
    process.env.NEXT_PUBLIC_DEMO_PHONE ||
    '917077805321'; // User's number for demo
  const now = new Date();
  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return { student_name: name, phone, time };
}

function studentPayload(
  tenantId: string,
  studentName: string
): { student_name: string; phone: string; time: string } {
  const phone =
    process.env.NEXT_PUBLIC_DEMO_PHONE ||
    '917077805321'; // User's number for demo
  const now = new Date();
  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return { student_name: studentName, phone, time };
}

function getCampusLabel(tenantId: string): string {
  return CAMPUS_OPTIONS.find((c) => c.value === tenantId)?.label ?? tenantId;
}

function StatusBadge({ status, error_message }: { status: AttendanceLog['status']; error_message?: string }) {
  const schemes: Record<AttendanceLog['status'], { bg: string; color: string }> = {
    pending: { bg: 'yellow.100', color: 'yellow.800' },
    sent: { bg: 'blue.100', color: 'blue.800' },
    delivered: { bg: 'green.100', color: 'green.800' },
    failed: { bg: 'red.100', color: 'red.800' },
  };
  const s = schemes[status];
  const badge = (
    <Badge bg={s.bg} color={s.color} textTransform="capitalize" px="2" py="1" borderRadius="md">
      {status}
    </Badge>
  );
  if (status === 'failed' && error_message) {
    return (
      <Tooltip label={error_message} placement="top" hasArrow>
        <Box as="span" cursor="help">{badge}</Box>
      </Tooltip>
    );
  }
  return badge;
}

export default function DashboardPage() {
  const brandColor = useColorModeValue('brand.500', 'white');
  const boxBg = useColorModeValue('secondaryGray.300', 'whiteAlpha.100');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');
  const { tenantId } = useCampus();
  const toast = useToast();

  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, sent: 0, delivered: 0, failed: 0 });
  const [simulating, setSimulating] = useState(false);
  const { isOpen: isBiometricOpen, onOpen: onBiometricOpen, onClose: onBiometricClose } = useDisclosure();
  const { isOpen: isFaceScanOpen, onOpen: onFaceScanOpen, onClose: onFaceScanClose } = useDisclosure();

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/attendance-logs?tenant_id=${encodeURIComponent(tenantId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setLogs(data.logs ?? []);
      setStats(data.stats ?? { total: 0, pending: 0, sent: 0, delivered: 0, failed: 0 });
    } catch {
      // ignore
    }
  }, [tenantId]);

  useEffect(() => {
    fetchLogs();
    const t = setInterval(fetchLogs, 2000);
    return () => clearInterval(t);
  }, [fetchLogs]);

  const onSimulate = async () => {
    setSimulating(true);
    const { student_name, phone, time } = randomStudent(tenantId);
    try {
      const res = await fetch('/api/attendance-event', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          student_name,
          phone,
          time,
          tenant_id: tenantId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data?.error ?? 'Request failed', status: 'error', isClosable: true });
        return;
      }
      toast({
        title: data.status === 'sent' ? 'WhatsApp sent' : 'Send failed (see table)',
        status: data.status === 'sent' ? 'success' : 'warning',
        isClosable: true,
      });
      fetchLogs();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error';
      toast({
        title: 'Network error',
        description: msg,
        status: 'error',
        isClosable: true,
        duration: 8000,
      });
    } finally {
      setSimulating(false);
    }
  };

  const onBiometricSuccess = useCallback(
    async (studentName: string) => {
      setSimulating(true);
      const { student_name, phone, time } = studentPayload(tenantId, studentName);
      try {
        const res = await fetch('/api/attendance-event', {
          method: 'POST',
          headers: apiHeaders(),
          body: JSON.stringify({ student_name, phone, time, tenant_id: tenantId }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast({ title: data?.error ?? 'Request failed', status: 'error', isClosable: true });
          return;
        }
        toast({
          title: data.status === 'sent' ? 'Attendance registered & WhatsApp sent' : 'Send failed (see table)',
          status: data.status === 'sent' ? 'success' : 'warning',
          isClosable: true,
        });
        fetchLogs();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Network error';
        toast({
          title: 'Network error',
          description: msg,
          status: 'error',
          isClosable: true,
          duration: 8000,
        });
      } finally {
        setSimulating(false);
      }
    },
    [tenantId, toast, fetchLogs]
  );

  const onFaceScanSuccess = useCallback(
    async (_analysis: { confidence: number; yaw: number; pitch: number; roll: number }) => {
      onFaceScanClose();
      const name = DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)];
      setSimulating(true);
      const { student_name, phone, time } = studentPayload(tenantId, name);
      try {
        const res = await fetch('/api/attendance-event', {
          method: 'POST',
          headers: apiHeaders(),
          body: JSON.stringify({ student_name, phone, time, tenant_id: tenantId }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast({ title: data?.error ?? 'Request failed', status: 'error', isClosable: true });
          return;
        }
        toast({
          title: data.status === 'sent' ? 'Face scan complete — Attendance & WhatsApp sent' : 'Send failed (see table)',
          status: data.status === 'sent' ? 'success' : 'warning',
          isClosable: true,
        });
        fetchLogs();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Network error';
        toast({ title: 'Network error', description: msg, status: 'error', isClosable: true, duration: 8000 });
      } finally {
        setSimulating(false);
      }
    },
    [tenantId, toast, fetchLogs, onFaceScanClose]
  );

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      {/* POC flow: Biometric Scan → Attendance → WhatsApp */}
      {/* <Flex mb="20px" align="center" gap="4" flexWrap="wrap">
        <Button
          type="button"
          colorScheme="green"
          size="lg"
          leftIcon={simulating ? <Spinner size="sm" /> : undefined}
          onClick={onBiometricOpen}
        >
          Biometric Scan (Fingerprint / Face)
        </Button>
        <Button
          colorScheme="brand"
          size="lg"
          variant="outline"
          leftIcon={simulating ? <Spinner size="sm" /> : undefined}
          onClick={onSimulate}
          isDisabled={simulating}
        >
          {simulating ? 'Sending…' : 'Quick Simulate'}
        </Button>
        <Text fontSize="sm" color="secondaryGray.600">
          Full POC: Scan → Register → WhatsApp · Campus: {getCampusLabel(tenantId)}
        </Text>
      </Flex> */}

      {isBiometricOpen && (
        <BiometricSimulator
          isOpen
          onClose={onBiometricClose}
          onScanSuccess={onBiometricSuccess}
          campusLabel={getCampusLabel(tenantId)}
        />
      )}

      {isFaceScanOpen && (
        <FaceScanAnalysis
          isOpen
          onClose={onFaceScanClose}
          onScanSuccess={onFaceScanSuccess}
        />
      )}

      {/* Demo Setup (3 steps) */}
      <Box mb="20px">
        <DemoSetupCard />
      </Box>

      {/* Face Scan Analysis card */}
      <Card p="6" mb="20px">
        <Flex alignItems="center" justifyContent="space-between" flexWrap="wrap" gap="4">
          <Box>
            <Text color={textColor} fontSize="lg" fontWeight="700" mb="1">
              Face Scan Analysis
            </Text>
            <Text fontSize="sm" color="gray.500">
              Detailed face scan with pose guidance — turn left, right, look up/down. Captures yaw, pitch, roll & quality.
            </Text>
          </Box>
          <Button
            colorScheme="brand"
            size="lg"
            leftIcon={simulating ? <Spinner size="sm" aria-hidden /> : undefined}
            onClick={onFaceScanOpen}
            isDisabled={simulating}
            aria-label={simulating ? 'Processing face scan' : 'Start face scan analysis with pose guidance'}
          >
            {simulating ? 'Processing…' : 'Start Face Scan'}
          </Button>
        </Flex>
      </Card>

      {/* Time Widget */}
      <CurrentTimeWidget />

      {/* Stats row - live from API, filtered by campus */}
      <SimpleGrid
        columns={{ base: 1, md: 2, lg: 3, xl: 5 }}
        gap="20px"
        mb="20px"
      >
        <MiniStatistics
          startContent={
            <IconBox
              w="56px"
              h="56px"
              bg={boxBg}
              icon={<Icon w="32px" h="32px" as={MdPeople} color={brandColor} />}
            />
          }
          name="Total Events"
          value={String(stats.total)}
        />
        <MiniStatistics
          startContent={
            <IconBox
              w="56px"
              h="56px"
              bg={boxBg}
              icon={<Icon w="32px" h="32px" as={MdSchedule} color="yellow.500" />}
            />
          }
          name="Pending"
          value={String(stats.pending)}
        />
        <MiniStatistics
          startContent={
            <IconBox
              w="56px"
              h="56px"
              bg={boxBg}
              icon={<Icon w="32px" h="32px" as={MdSend} color="blue.500" />}
            />
          }
          name="Sent"
          value={String(stats.sent)}
        />
        <MiniStatistics
          startContent={
            <IconBox
              w="56px"
              h="56px"
              bg={boxBg}
              icon={<Icon w="32px" h="32px" as={MdOutlineDoneAll} color="green.500" />}
            />
          }
          name="Delivered"
          value={String(stats.delivered)}
        />
        <MiniStatistics
          startContent={
            <IconBox
              w="56px"
              h="56px"
              bg={boxBg}
              icon={<Icon w="32px" h="32px" as={MdOutlineError} color="red.500" />}
            />
          }
          name="Failed"
          value={String(stats.failed)}
        />
      </SimpleGrid>

      {/* Live camera feed */}
      <Box mb="20px">
        <LiveFeedCard />
      </Box>

      {/* Face tracking: Enrolled faces + Enrollment info + Enroll script helper */}
      <SimpleGrid columns={{ base: 1, lg: 3 }} gap="20px" mb="20px">
        <EnrolledFacesCard />
        <EnrollmentInfoCard />
        <EnrollFaceCard />
      </SimpleGrid>

      {/* Charts row */}
      <SimpleGrid columns={{ base: 1, xl: 2 }} gap="20px" mb="20px">
        <Card p="20px" alignItems="center" flexDirection="column" w="100%">
          <Text color={textColor} fontSize="md" fontWeight="600" mb="16px" w="100%">
            Attendance Timeline (Today)
          </Text>
          <Box h="240px" w="100%">
            <BarChart
              chartData={attendanceTimelineData}
              chartOptions={attendanceTimelineOptions}
            />
          </Box>
        </Card>
        <Card p="20px" alignItems="center" flexDirection="column" w="100%">
          <Text color={textColor} fontSize="md" fontWeight="600" mb="16px" w="100%">
            Notification Success Rate
          </Text>
          <Box h="240px" w="100%">
            <PieChart
              chartData={notificationSuccessPieData}
              chartOptions={notificationSuccessPieOptions}
            />
          </Box>
          <Flex gap="24px" mt="12px" flexWrap="wrap">
            <Flex align="center" gap="2">
              <Box w="10px" h="10px" borderRadius="full" bg="green.500" />
              <Text fontSize="sm" color="secondaryGray.600">Delivered</Text>
            </Flex>
            <Flex align="center" gap="2">
              <Box w="10px" h="10px" borderRadius="full" bg="red.500" />
              <Text fontSize="sm" color="secondaryGray.600">Failed</Text>
            </Flex>
          </Flex>
        </Card>
      </SimpleGrid>

      <Box mb="20px">
        <SendNotificationStepper />
      </Box>

      {/* Live notifications table */}
      <Card flexDirection="column" w="100%" px="0px" overflowX={{ sm: 'scroll', lg: 'hidden' }}>
        <Flex px="25px" mb="8px" justifyContent="space-between" align="center">
          <Text color={textColor} fontSize="22px" fontWeight="700" lineHeight="100%">
            Notifications (live · refreshes every 2s)
          </Text>
        </Flex>
        <Box as="section" aria-label="Attendance notifications">
          <Table variant="simple" color="gray.500" mb="24px" mt="12px" role="table" aria-label="Notifications table">
            <Thead>
              <Tr>
                <Th pe="10px" borderColor={borderColor} fontSize={{ sm: '10px', lg: '12px' }} color="gray.400" scope="col">CAMPUS</Th>
                <Th pe="10px" borderColor={borderColor} fontSize={{ sm: '10px', lg: '12px' }} color="gray.400" scope="col">STUDENT</Th>
                <Th pe="10px" borderColor={borderColor} fontSize={{ sm: '10px', lg: '12px' }} color="gray.400" scope="col">PHONE</Th>
                <Th pe="10px" borderColor={borderColor} fontSize={{ sm: '10px', lg: '12px' }} color="gray.400" scope="col">TIME</Th>
                <Th pe="10px" borderColor={borderColor} fontSize={{ sm: '10px', lg: '12px' }} color="gray.400" scope="col">STATUS</Th>
              </Tr>
            </Thead>
            <Tbody>
              {logs.length === 0 ? (
                <Tr>
                  <Td colSpan={5} color={textColor} textAlign="center" py="8">
                    No events yet. Click “Simulate Attendance” to send a real WhatsApp.
                  </Td>
                </Tr>
              ) : (
                logs.map((row) => (
                  <Tr key={row.id}>
                    <Td fontSize="sm" fontWeight="600" color={textColor} borderColor="transparent">
                      {getCampusLabel(row.tenant_id)}
                    </Td>
                    <Td fontSize="sm" fontWeight="700" color={textColor} borderColor="transparent">
                      {row.student_name}
                    </Td>
                    <Td fontSize="sm" color={textColor} borderColor="transparent">
                      {row.phone}
                    </Td>
                    <Td fontSize="sm" fontWeight="700" color={textColor} borderColor="transparent">
                      {row.time}
                    </Td>
                    <Td borderColor="transparent">
                      <StatusBadge status={row.status} error_message={row.error_message} />
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
        </Box>
      </Card>
    </Box>
  );
}
