import 'dotenv/config';
import { hash } from 'bcryptjs';
import { db } from '../src/lib/db';
import { createProject, createMilestone, agree } from '../src/lib/projects';
async function main() {
  if (process.env.ENABLE_DEMO !== 'true')
    throw new Error(
      'Set ENABLE_DEMO=true explicitly before seeding fictional demo accounts. Never seed these accounts into a real-user deployment.',
    );
  const passwordHash = await hash('Demo-Only-Password-2026!', 12);
  const client = await db.user.upsert({
    where: { email: 'client@proofpay.example' },
    create: {
      name: 'Alex Morgan (Demo)',
      email: 'client@proofpay.example',
      role: 'CLIENT',
      passwordHash,
    },
    update: {},
  });
  const freelancer = await db.user.upsert({
    where: { email: 'freelancer@proofpay.example' },
    create: {
      name: 'Jamie Chen (Demo)',
      email: 'freelancer@proofpay.example',
      role: 'FREELANCER',
      passwordHash,
    },
    update: {},
  });
  if (
    !(await db.project.findFirst({
      where: { clientId: client.id, title: 'Freelancer Portfolio Website · Demo' },
    }))
  ) {
    const p = await createProject(client, {
      title: 'Freelancer Portfolio Website · Demo',
      description:
        'Fictional demo project. Review uploaded portfolio artifacts, then inspect the actual site manually before acceptance.',
      freelancerEmail: freelancer.email,
    });
    const m = await createMilestone(client, p.id, {
      title: 'Homepage & project gallery',
      description:
        'Deliver the agreed homepage, gallery, contact form and mobile layout. Artifact checks verify file contents only.',
      amount: '450.00',
      currency: 'USD',
      dueDate: '2026-11-10',
      requirements: [
        {
          description: 'Homepage artifact contains the agreed heading',
          method: 'TEXT_CONTAINS',
          expected: 'Design for a brighter web',
          evidenceRequired: 'UTF-8 text export of homepage content',
        },
        {
          description: 'Gallery manifest contains four projects',
          method: 'JSON_VALUE',
          expected: 'galleryCount=4',
          evidenceRequired: 'JSON project gallery manifest',
        },
        {
          description: 'Contact form validates and delivers a message',
          method: 'MANUAL',
          expected: 'Client checks validation and confirms message receipt',
          evidenceRequired: 'Test notes and source or live demonstration',
        },
        {
          description: 'Mobile layout works at 375px and 768px',
          method: 'MANUAL',
          expected: 'Client inspects both viewports for clipping and usable navigation',
          evidenceRequired: 'PNG screenshots and manual viewport inspection',
        },
      ],
    });
    await agree(client, m.id, 0);
    await agree(freelancer, m.id, 1);
  }
  console.log(
    'Fictional demo users and agreed portfolio project are ready. See README for demo credentials.',
  );
}
main().finally(() => db.$disconnect());
