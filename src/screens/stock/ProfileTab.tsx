import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, space, themed } from '../../theme';
import type { CompanyInfo } from '../../psx/types';
import { Panel } from '../../ui/bits';
import { Icon, Loading, Section, T } from '../../ui/kit';

function Item({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <View style={[styles.item, !last && styles.border]}>
      <T v="caption">{label}</T>
      {children}
    </View>
  );
}

export function ProfileTab({ company, err }: { company: CompanyInfo | null; err: string | null }) {
  const [open, setOpen] = useState(false);
  if (!company) return err ? <T v="caption">Couldn't load company data: {err}</T> : <Loading />;
  const site = company.website;

  return (
    <View style={{ gap: space.section }}>
      {company.description ? (
        <Section title="About">
          <Pressable accessibilityRole="button" onPress={() => setOpen((v) => !v)} style={{ gap: 6 }}>
            <T v="body" style={{ color: colors.text2 }} numberOfLines={open ? undefined : 5}>
              {company.description}
            </T>
            {company.description.length > 260 ? (
              <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.gold }}>{open ? 'Show less' : 'Read more'}</T>
            ) : null}
          </Pressable>
        </Section>
      ) : null}

      {company.people.length ? (
        <Section title="Key people">
          <Panel>
            {company.people.map((p, i) => (
              <View key={p.name + p.role} style={[styles.person, i < company.people.length - 1 && styles.border]}>
                <View style={styles.initials}>
                  <T style={{ fontFamily: fonts.heavy, fontSize: 13, color: colors.text2 }}>
                    {p.name
                      .replace(/^(Mr|Mrs|Ms|Dr|Mian|Syed)\.?\s+/i, '')
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join('')}
                  </T>
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <T v="body" style={{ fontFamily: fonts.semibold, fontSize: 15 }}>
                    {p.name}
                  </T>
                  <T v="caption">{p.role}</T>
                </View>
              </View>
            ))}
          </Panel>
        </Section>
      ) : null}

      <Section title="Company">
        <Panel>
          <Item label="Sector">
            <T v="body">{company.sector ? company.sector.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bAnd\b/g, '&') : '—'}</T>
          </Item>
          <Item label="Fiscal year ends">
            <T v="body">{company.fiscalYearEnd ?? '—'}</T>
          </Item>
          {site ? (
            <Item label="Website">
              <Pressable accessibilityRole="link" onPress={() => Linking.openURL(/^https?:/.test(site) ? site : `http://${site}`)} style={styles.link}>
                <T v="body" style={{ color: colors.gold, fontFamily: fonts.semibold }}>
                  {site.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </T>
                <Icon name="link" size={16} color={colors.gold} />
              </Pressable>
            </Item>
          ) : null}
          <Item label="Address">
            <T v="body" style={{ fontSize: 14.5, lineHeight: 20 }}>
              {company.address ?? '—'}
            </T>
          </Item>
          <Item label="Auditor">
            <T v="body" style={{ fontSize: 14.5, lineHeight: 20 }}>
              {company.auditor ?? '—'}
            </T>
          </Item>
          <Item label="Share registrar" last>
            <T v="body" style={{ fontSize: 14.5, lineHeight: 20 }}>
              {company.registrar ?? '—'}
            </T>
          </Item>
        </Panel>
      </Section>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    item: { paddingVertical: 12, gap: 3 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    initials: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
    link: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  }),
);
