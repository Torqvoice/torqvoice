import type { Metadata } from "next";
import Link from "next/link";
import { Gauge } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service | Torqvoice",
  description: "Terms of Service for Torqvoice workshop management platform",
};

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="rounded-xl border bg-background p-6 shadow-sm sm:p-8">
        {/* Header */}
        <div className="border-b pb-6">
          <div className="flex items-center gap-2">
            <Gauge className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold tracking-wider uppercase">
              Torqvoice
            </span>
          </div>
          <h1 className="mt-4 text-2xl font-bold">Terms of Service</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Last updated: February 2026
          </p>
        </div>

        {/* Content */}
        <div className="mt-6 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using Torqvoice (&quot;the Service&quot;,
              &quot;the Platform&quot;), you agree to be bound by these Terms of
              Service (&quot;Terms&quot;). If you do not agree to these Terms, do
              not use the Service. Your continued use of the Service constitutes
              acceptance of any changes to these Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              2. Description of Service
            </h2>
            <p>
              Torqvoice is a workshop management platform that provides tools
              for managing vehicles, service records, customers, quotes,
              invoices, and inventory. The Service is provided &quot;as is&quot;
              and &quot;as available&quot; for your use.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              3. User Responsibilities
            </h2>
            <p>By using the Service, you acknowledge and agree that:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                You are solely responsible for all data you enter, store, and
                manage through the Service, including but not limited to customer
                information, vehicle records, financial data, and invoices.
              </li>
              <li>
                You are responsible for ensuring the accuracy and legality of all
                information and content you submit.
              </li>
              <li>
                You are responsible for complying with all applicable local,
                national, and international laws and regulations in your
                jurisdiction, including tax laws, consumer protection laws, data
                protection regulations (such as GDPR), and industry-specific
                requirements.
              </li>
              <li>
                You are responsible for maintaining the confidentiality of your
                account credentials and for all activities that occur under your
                account.
              </li>
              <li>
                You are responsible for maintaining appropriate backups of your
                data.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              4. Disclaimer of Warranties
            </h2>
            <p className="font-medium text-foreground">
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS
              AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR
              IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
              NON-INFRINGEMENT, OR COURSE OF PERFORMANCE.
            </p>
            <p className="mt-2">
              Torqvoice and its operators do not warrant that: (a) the Service
              will function uninterrupted, secure, or available at any
              particular time or location; (b) any errors or defects will be
              corrected; (c) the Service is free of viruses or other harmful
              components; or (d) the results of using the Service will meet your
              requirements.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              5. Limitation of Liability
            </h2>
            <p className="font-medium text-foreground">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT
              SHALL TORQVOICE, ITS OPERATORS, OWNERS, DEVELOPERS, AFFILIATES,
              OR SERVICE PROVIDERS BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT
              LIMITED TO: LOSS OF PROFITS, DATA, BUSINESS, GOODWILL, OR OTHER
              INTANGIBLE LOSSES, RESULTING FROM:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6 font-medium text-foreground">
              <li>Your access to or use of (or inability to use) the Service;</li>
              <li>
                Any conduct or content of any third party on the Service;
              </li>
              <li>Any content obtained from the Service;</li>
              <li>
                Unauthorized access, use, or alteration of your data or
                transmissions;
              </li>
              <li>
                Errors, inaccuracies, or omissions in invoices, quotes, or other
                documents generated through the Service;
              </li>
              <li>
                Any financial losses, tax liabilities, or legal claims arising
                from your use of the Service;
              </li>
              <li>Data loss or corruption;</li>
              <li>Service interruptions or downtime.</li>
            </ul>
            <p className="mt-2 font-medium text-foreground">
              THIS LIMITATION APPLIES WHETHER THE ALLEGED LIABILITY IS BASED ON
              CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY, OR ANY OTHER BASIS,
              EVEN IF TORQVOICE HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH
              DAMAGE.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              6. Indemnification
            </h2>
            <p>
              You agree to defend, indemnify, and hold harmless Torqvoice, its
              operators, owners, developers, and affiliates from and against any
              claims, damages, obligations, losses, liabilities, costs, or debt,
              and expenses (including attorney&apos;s fees) arising from: (a)
              your use of and access to the Service; (b) your violation of any
              term of these Terms; (c) your violation of any third-party right,
              including without limitation any intellectual property,
              privacy, or consumer protection right; or (d) any claim that your
              use of the Service caused damage to a third party.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              7. Data and Privacy
            </h2>
            <p>
              You retain ownership of all data you input into the Service. You
              are solely responsible for the legality, reliability, and
              appropriateness of the data you store and process through the
              Service. If you collect personal data from your customers, you are
              the data controller and are responsible for compliance with
              applicable data protection laws.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              8. Financial and Legal Disclaimer
            </h2>
            <p>
              The Service is a tool to assist with workshop management. It does
              not provide legal, financial, tax, or accounting advice. Invoices,
              quotes, and reports generated by the Service are produced based on
              data you provide and may not comply with the specific legal
              requirements of your jurisdiction. You are solely responsible for
              ensuring that all financial documents comply with applicable laws
              and regulations. Torqvoice is not a licensed accounting, tax, or
              legal service provider.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              9. Service Availability
            </h2>
            <p>
              Torqvoice reserves the right to modify, suspend, or discontinue
              the Service (or any part thereof) at any time, with or without
              notice. We shall not be liable to you or any third party for any
              modification, suspension, or discontinuance of the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              10. Account Termination
            </h2>
            <p>
              We may terminate or suspend your account and access to the Service
              immediately, without prior notice or liability, for any reason,
              including if you breach these Terms. Upon termination, your right
              to use the Service will immediately cease. You may also delete your
              account at any time through the account settings.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              11. Changes to Terms
            </h2>
            <p>
              We reserve the right to modify these Terms at any time. Changes
              will be effective immediately upon posting. Your continued use of
              the Service after any changes constitutes acceptance of the new
              Terms. It is your responsibility to review these Terms
              periodically.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              12. Governing Law
            </h2>
            <p>
              These Terms shall be governed by and construed in accordance with
              the laws of the jurisdiction in which the Service operator
              resides, without regard to its conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              13. Severability
            </h2>
            <p>
              If any provision of these Terms is held to be unenforceable or
              invalid, such provision will be changed and interpreted to
              accomplish the objectives of such provision to the greatest extent
              possible under applicable law, and the remaining provisions will
              continue in full force and effect.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              14. Entire Agreement
            </h2>
            <p>
              These Terms constitute the entire agreement between you and
              Torqvoice regarding your use of the Service and supersede all
              prior agreements and understandings.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-8 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            If you have questions about these Terms, please contact the platform
            administrator.
          </p>
          <Link
            href="/auth/sign-up"
            className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
          >
            Back to Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
}
