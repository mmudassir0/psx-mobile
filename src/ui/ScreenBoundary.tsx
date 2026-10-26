/** Catches a crash inside one screen: logs it and offers to try again, instead of closing the whole app. */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { colors, fonts } from '../theme';
import { logProblem } from '../log';
import { Button, T } from './kit';

interface Props {
  name: string;
  children: React.ReactNode;
}

export class ScreenBoundary extends React.Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    logProblem(`screen ${this.props.name}`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.ground }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 14 }}>
        <T style={{ fontFamily: fonts.heavy, fontSize: 20 }}>This screen hit a problem</T>
        <T v="body" style={{ color: colors.text2, lineHeight: 21 }}>
          The rest of Sahm still works. It's saved in Settings → Problem log, so it can be fixed.
        </T>
        <T v="caption" numberOfLines={3}>
          {this.state.error.message}
        </T>
        <View style={{ flexDirection: 'row' }}>
          <Button label="Try again" onPress={() => this.setState({ error: null })} />
        </View>
      </ScrollView>
    );
  }
}
